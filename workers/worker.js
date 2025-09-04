const amqp = require('amqplib');
const path = require('path');
const Fastify = require('fastify');

const chatService = require('../src/services/chatService');
const roomService = require('../src/services/roomService');
const usersService = require('../src/services/usersService');

const couchbasePlugin = require('../src/plugins/couchbase');

const QUEUE = 'db_tasks';
const RABBIT_URL = 'amqp://guest:guest@localhost:5672'

async function startWorker(){
    try{
        const fastify = Fastify();
        fastify.register(couchbasePlugin);
        await fastify.ready();
        console.log('couchbase connected inside worker');

        const connection = await amqp.connect(RABBIT_URL);
        const channel = await connection.createChannel();

        await channel.assertQueue(QUEUE, {durable:true});
        console.log('worker connected to rabbit queue', QUEUE);

        channel.consume(QUEUE, async(msg)=>{
            if(!msg) return;
            const task = JSON.parse(msg.content.toString());
            let result;
            console.log('worker recieved task', task);

            try{
                switch (task.type){
                    case 'saveMessage':{
                        const {messageTemp, latestAction} = task.payload;
                        const {messageDoc, id} = messageTemp;
                        console.log(messageDoc);
                        console.log(id);
                        await chatService.saveMessage(fastify, messageDoc, id);
                        await roomService.addMessageToRoom(fastify, messageDoc.room, id);
                        await roomService.updateLatestAction(fastify, messageDoc.room, latestAction);
                        console.log('done with', task.type);
                        break;
                    }
                    case 'acceptRequest':{
                        const {payload} = task;
                        const {roomDoc, roomId, idA, idB} = payload;
                        await roomService.createPrivateRoom(fastify, roomDoc, roomId);
                        await usersService.addFriend(fastify, idA, idB);
                        result = {success:true};
                        console.log('done with', task.type);
                        break;
                    }
                    case 'markAsSeen':{
                        const {payload} = task;
                        const {buffer, userId} = payload;
                        await chatService.markMessagesAsSeen(fastify, buffer, userId);
                        console.log('done with', task.type);
                        break;
                    }
                    case 'createGroup':{
                        const {payload} = task;
                        const {roomDoc, roomId, userId} = payload;
                        const exists = await roomService.roomExists(fastify, roomId);
                        if(!exists){
                            await roomService.createRoom(fastify, roomDoc, roomId);
                            await usersService.addToGroups(fastify, userId, roomId);
                            result = {success:true, roomId};
                        }
                        else{
                            result = {success:false, error:'room already exists'};
                        }
                        console.log('done with', task.type);
                        break;
                    }
                    case 'joinExistingGroup':{
                        const {payload} = task;
                        const {userId, groupId, messageDoc, messageId, latestAction} = payload;
                        const joinedGroup = await roomService.addUserToGroup(fastify, groupId, userId, latestAction);
                        await usersService.addToGroups(fastify, userId, groupId);
                        await chatService.saveMessage(fastify, messageDoc, messageId);
                        result = {success:true, joinedGroup};
                        console.log('done with', task.type);
                        break;
                    }
                    case 'makeFriendRequest':{
                        const {payload} = task;
                        const {userId, friendUsername} = payload;
                        await usersService.makeFriendRequest(fastify, userId, friendUsername);
                        result = {success:true};
                        console.log('done with', task.type);
                        break;
                    }
                    default:{
                        result = {
                            success:false,
                            error: `unknown task type${task.type}`
                        }
                    }
                }
            }catch(err){
                console.log(err.message);
                result = {success:false, error:err.message};
            }
            if(msg.properties.replyTo && msg.properties.correlationId){
                channel.sendToQueue(
                    msg.properties.replyTo, 
                    Buffer.from(JSON.stringify(result)),
                    {correlationId:msg.properties.correlationId}
                )
            }
        }, {noAck:true});
        const cleanup = async()=>{
            fastify.log.info('closing rabbitmq connection...');
            await channel?.close().catch(()=>{});
            await connection?.close().catch(()=>{});
            process.exit(0);
        }
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }catch(err){
        console.log(err.message);
        throw new Error(err);
    }
}
startWorker();
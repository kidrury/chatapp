const {saveMessage, loadRoomMessage, markMessagesAsSeen} = require('../services/chatService');
const SeenService = require('../services/SeenService');
const usersService = require('../services/usersService')
const roomService = require('../services/roomService');
const {messageDocTemplate, latestActionTemplate, privateRoomTemplate, groupTemplate} = require('../utils/templates');
const helperFunctions = require('../utils/helperFunctions');
const {encryptMessage, decryptMessage} = require('../utils/crypto/encryption');
const { User } = require('couchbase');


let cachedFriends = new Map();
let tempSeenBuffer = new Map();

const registerChatEvents = function(fastify, io, socket, onlineUsersMap){
    // const seenService = new SeenService(socket.user.sub, markMessagesAsSeen);
    const seenService = new SeenService(socket.user.sub);
    // socket.emit('welcome', fastify, socket.user);
    socket.on('getUserData', async()=>{
        try{
            const userId = socket.user.sub;
            const user = await usersService.loadUser(fastify, userId);
            cachedFriends.set(userId, user.friends);
            const onlineFriends = user.friends.filter(friendId=>onlineUsersMap.has(friendId));
            const friendsUsernames = user.friends.map(friend=>friend = friend.replace('user::', ''));
            const friendsRoomsIds = friendsUsernames.map(friend=>friend = `room::${[socket.user.username, friend].sort().join('::')}`);
            const friendsRooms = await roomService.getMultipleRooms(fastify, friendsRoomsIds);
            const groups = await roomService.getMultipleRooms(fastify, user.groups);
            const seenWhenGone = tempSeenBuffer.has(socket.user.username) && tempSeenBuffer.get(socket.user.username).length>0 ? tempSeenBuffer.get(socket.user.username) : null;
            const data = {
                ...user,
                onlineFriends,
                groups,
                friendsRooms,
                tempSeen: seenWhenGone
            }
            socket.emit('userData', data);
            onlineFriends.forEach(friendId => {
                const friendSocket = onlineUsersMap.get(friendId);
                if(friendSocket){
                    io.to(friendSocket).emit('friendOnline', socket.user.sub);
                }
            });
        }catch(err){
            console.log(err.message);
        }
    });
    socket.on('createGroup', async(groupName)=>{
        try{
            const userId = socket.user.sub;
            const roomTemplate = groupTemplate(groupName, userId);
            // const exists = await roomService.roomExists(fastify, groupName);
            // const result = await publishTaskRpc({
            //     type:'createGroup',
            //     payload:{
            //         roomDoc: roomTemplate.roomDoc,
            //         roomId: roomTemplate.roomId,
            //         userId
            //     }
            // })
            const result = await fastify.rabbit.publishTaskRpc({
                type:'createGroup',
                payload:{
                    roomDoc: roomTemplate.roomDoc,
                    roomId: roomTemplate.roomId,
                    userId
                }
            })
            if(!result.success){
                socket.emit('groupExists');
                return;
            }
            socket.emit('updateFeed', {id:roomTemplate.roomId, ...roomTemplate.roomDoc});

            // // if(!exists){
            // //     const createdGroup = await roomService.createRoom(fastify, groupName, socket.user.sub);
            // //     const groupId = `room::${createdGroup.name}`;
            // //     const updatedGroupIdArray = await usersService.addToGroups(fastify, userId, groupId);
            // //     const groupsArray = await roomService.getMultipleRooms(fastify, updatedGroupIdArray);
            // //     socket.emit('done', groupsArray);
            // //     socket.emit('updateFeed', {id:groupId, ...createdGroup});
            // // }
            // else socket.emit('groupExists');
        }catch(err){
            fastify.log.error('error inside createGroup event',err);
            socket.emit('error', {message:'failed to create group', details:err.message})
        }
    })
    socket.on('joinExistingGroup', async(groupId)=>{
        try{
            const userId = socket.user.sub;
            const user = socket.user.username;
            const timestamp = new Date().toISOString();
            const message = `${user} joined the group`;
            const aadMeta = {room, user, timestamp};
            const encrypted = encryptMessage(groupId, message, aadMeta)
            const {id, messageDocPlain, messageDocEncrypted} = messageDocTemplate({room:groupId, user, message, encrypted, aadMeta, type:'broadcast', timestamp});
            const savedMessage = {id, ...messageDocPlain};
            const {latestActionPlain, latestActionEncrypted} = latestActionTemplate(savedMessage, encrypted);
            const result = await fastify.rabbit.publishTaskRpc({
                type:'joinExistingGroup',
                payload:{
                    userId,
                    groupId, 
                    messageDoc: messageDocEncrypted, 
                    messageId: id,
                    latestAction: latestActionEncrypted
                }
            })
            // const joinedGroup = await roomService.addUserToGroup(fastify, groupId, userId);
            // const updatedGroupIdArray = await usersService.addToGroups(fastify, userId, groupId);
            // const savedMessage = await saveMessage(fastify, {room:groupId, user:userId, message:'joined the group', type:'broadcast'})
            if(!result.success){
                socket.emit('error', {message:result.error})
                return;
            }
            socket.emit('updateFeed', {id:groupId, ...result.joinedGroup});
            io.to(groupId).emit('recieveMessage', savedMessage, latestActionPlain);
        }catch(err){
            fastify.log.error('error inside createGroup event',err);
            socket.emit('error', {message:'failed to join group', details:err.message})
        }
    })
    socket.on('makeFreindRequest', async(friendUsername)=>{
        try{
            const userId = socket.user.sub;
            // const result = await publishTaskRpc({
            //     type:'makeFriendRequest',
            //     payload:{
            //         userId,
            //         friendUsername
            //     }
            // })
            const result = await fastify.rabbit.publishTaskRpc({
                type:'makeFriendRequest',
                payload:{
                    userId,
                    friendUsername
                }
            })
            // await usersService.makeFriendRequest(fastify, socket.user.sub, friendUsername);
            if(result.success){
                const friendSocket = onlineUsersMap.get(`user::${friendUsername}`);
                io.to(friendSocket).emit('refreshRequests', socket.user.sub);
                socket.emit('done');
            }
            else socket.emit('error', {message:result.error});
        }catch(err){
            socket.emit('error', {message:'failed to make request', details:err.message});
        }
    })
    socket.on('acceptRequest', async(friendId)=>{
        const friendSocket = onlineUsersMap.get(friendId);
        const roomDocTemp = privateRoomTemplate(socket.user.sub, friendId);
        try{
            // const result = await publishTaskRpc({
            //     type:'acceptRequest',
            //     payload:{
            //         roomDoc : roomDocTemp.roomDoc,
            //         roomId : roomDocTemp.roomId,
            //         idA: socket.user.sub,
            //         idB : friendId
            //     }
            // })
            const result = await fastify.rabbit.publishTaskRpc({
                type:'acceptRequest',
                payload:{
                    roomDoc : roomDocTemp.roomDoc,
                    roomId : roomDocTemp.roomId,
                    idA: socket.user.sub,
                    idB : friendId
                }
            })
            // const roomDoc = await roomService.createPrivateRoom(fastify, socket.user.sub, friendId);
            // await usersService.addFriend(fastify, socket.user.sub, friendId);
            if(!result.success){
                socket.emit('error', {message:result.error});
                return;
            }
            const roomDoc = {id:roomDocTemp.roomId, ...roomDocTemp.roomDoc};
            helperFunctions.addFriendToCache(socket.user.sub, friendId, cachedFriends);
            socket.emit('updateFeed', roomDoc);
            io.to(friendSocket).emit('updateFeed', roomDoc);
        } catch(err){
            socket.emit('error', {message:'failed to accept request', details:err.message});
        }
    })
    socket.on('join', async(roomId)=>{
        const username = socket.user.username;
        const userId = socket.user.sub;
        const parts = roomId.split('::');
        try{
            const userDoc = await usersService.loadUser(fastify, userId);
            if(parts.length === 3){
                const [_, userA, userB] = parts;
                if (userA !== username && userB !== username){
                    return socket.emit('error', 'user not authorized for this chat');
                }
                const friendUsername = username === userA ? userB : userA;
                if (!userDoc.friends.includes(`user::${friendUsername}`)){
                    console.log(`user::${friendUsername}`, userDoc.friends);
                    return socket.emit('error', 'user not authorized for this chat');
                }
                }
            else if(parts.length === 2){
                const groupName = parts[1];
                const isInGroup = userDoc.groups.includes(`room::${groupName}`);
                if(!isInGroup){
                    socket.emit('error', 'user not authorized for this group chat');
                }
            }
            socket.join(roomId);
            socket.emit('done');
        }catch(err){
            fastify.log.error('join error:', err)
             socket.emit('error', 'internal server error');
        }
    })
    socket.on('message', async(data)=>{
        const {room, message} = data;
        const user = socket.user.username;
        const timestamp = new Date().toISOString();
        const aadMeta = {room, user, timestamp};
        const encrypted = encryptMessage(room, message, aadMeta);
        // const {messageDoc, id} = messageDocTemplate({room, user, message, type:'text'});
        const {id, messageDocPlain, messageDocEncrypted} = messageDocTemplate({room, user, message, encrypted, type:'text', timestamp});
        const savedMessage= {
            ...messageDocPlain, id
        };
        console.log(messageDocEncrypted);
        const {latestActionPlain, latestActionEncrypted} = latestActionTemplate(savedMessage, messageDocEncrypted.message);
        console.log(latestActionEncrypted);
        try{
            fastify.rabbit.publishTask({
                type:'saveMessage', 
                payload:{
                    messageTemp: {messageDoc: messageDocEncrypted, id},
                    latestAction: latestActionEncrypted
                }
            })
            io.to(room).emit('recieveMessage', savedMessage, latestActionPlain);
        }catch(err){
            fastify.error.log(err);
            socket.emit('error', 'internal server error');
        }
    });
    socket.on('loadRoomMessages', async(roomId)=>{
        try{
            const loadedMessages = await loadRoomMessage(fastify, roomId);
            socket.emit('displayMessages', loadedMessages, roomId);
        }catch(err){
            fastify.error.log(err);
            socket.emit('error', 'internal server error');
        }
    })
    socket.on('typing', (roomId)=>{
        socket.to(roomId).emit('typing', socket.user.username, roomId)
    });
    socket.on('stop typing', (roomId)=>{
        socket.to(roomId).emit('stop typing', socket.user.username)
    });
    socket.on('message:seen', async({messageId, sender, group})=>{
        const userId = socket.user.sub;
        const username = socket.user.username;
        const roomId = helperFunctions.remakeRoomId(username, sender, group);
        await seenService.add(fastify, sender, messageId, roomId, tempSeenBuffer);
        const senderSocket = onlineUsersMap.get(`user::${sender}`);
        if(senderSocket){
            io.to(senderSocket).emit('doubleCheck', messageId, userId, roomId);
            seenService.tempFlush(sender, tempSeenBuffer);
        }

    })
    socket.on('disconnect', async()=>{
        await seenService.dbFlush(fastify, tempSeenBuffer)
        onlineUsersMap.delete(socket.user.sub);
        const friends = cachedFriends.get(socket.user.sub);
        if(friends){
            friends.forEach(friendId=>{
            const friendSocket = onlineUsersMap.get(friendId);
            if(friendSocket){
                io.to(friendSocket).emit('friendOffline', socket.user.sub);
            }
        })
        cachedFriends.delete(socket.user.sub);
        }

    })
}
module.exports = registerChatEvents;
const fp = require('fastify-plugin');
const amqp = require('amqplib');
const crypto = require('crypto');
let connection
let channel;
let replyQueue;
const pending = new Map();

async function rabbitmqPlugin(fastify, options){
    const {url} = options;
    try{
        connection = await amqp.connect('amqp://guest:guest@localhost:5672');
        channel = await connection.createChannel();
        await channel.assertQueue('db_tasks', {durable: true});
        const {queue} = await channel.assertQueue('', {exclusive:true, autoDelete:true});
        replyQueue = queue;

        await channel.consume(replyQueue, (msg)=>{
            if(!msg) return;
            const corrId = msg.properties.correlationId;
            const entry = pending.get(corrId);
            if(!entry) return;

            try {
                const payload = JSON.parse(msg.content.toString());
                entry.resolve(payload);
            } catch(err){
                entry.reject(err);
            }finally{
                clearTimeout(entry.timer);
                pending.delete(corrId);
            }
        },{noAck:true});
        fastify.decorate('rabbit', {
            connection,
            channel,
            replyQueue,
            publishTask: (task)=>{
                if(!channel) throw new Error('rabbitmq channel not initialized');
                channel.sendToQueue('db_tasks', Buffer.from(JSON.stringify(task)), {persistent:true});
                console.log('publishing task');
            },
            publishTaskRpc:(task, {timeout = 8000}={})=>{
                if(!channel || !replyQueue) {
                    return Promise.reject(new Error('rabbitmq not initialized'));
                }
                const correlationId = crypto.randomUUID();
                const body = Buffer.from(JSON.stringify(task));
                return new Promise((resolve, reject)=>{
                    const timer = setTimeout(()=>{
                        pending.delete(correlationId);
                        reject(new Error(`RPC timeout for task ${task.type}`));
                    }, timeout)
                    pending.set(correlationId, {resolve, reject, timer});
                    channel.sendToQueue('db_tasks', body, {
                        persistent: true,
                        correlationId,
                        replyTo: replyQueue
                    });
                    console.log('publishing task');
                });
            }
        });
        connection.on('error', (err)=>{
            fastify.log.error('rabbitmq connection error', err);
        })
        connection.on('close', ()=>{
            fastify.log.warn('rabbitmq connection closed');
        });
        fastify.log.info('rabbitmq connection registered successfully');
        console.log('RabbitMQ connection URL:', connection.connection.stream.remoteAddress);
        const cleanup = async()=>{
            fastify.log.info('closing rabbitmq connection...');
            await channel?.close().catch(()=>{});
            await connection?.close().catch(()=>{});
            process.exit(0);
        }
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

    } catch(err){
        fastify.log.error('failed to connect to rabbitmq', err);
        throw err;
    }
}
// function publishTask(task) {
//     if(!channel) throw new Error('rabbitmq channel not initialized');
//     channel.sendToQueue('db_tasks', Buffer.from(JSON.stringify(task)), {
//         persistent:true
//     });
// }
// function publishTaskRpc(task, {timeout = 8000}={}){
//     if(!channel || !replyQueue) {
//         return Promise.reject(new Error('rabbitmq not initialized'));
//     }
//     const correlationId = crypto.randomUUID();
//     const body = Buffer.from(JSON.stringify(task));
//     return new Promise((resolve, reject)=>{
//         const timer = setTimeout(()=>{
//             pending.delete(correlationId);
//             reject(new Error(`RPC timeout for task ${task.type}`));
//         }, timeout)
//         pending.set(correlationId, {resolve, reject, timer});
//         channel.sendToQueue('db_tasks', body, {
//             persistent: true,
//             correlationId,
//             replyTo: replyQueue
//         });
//     });
// }
// module.exports = {rabbitmqPlugin, publishTask, publishTaskRpc};
module.exports = fp(rabbitmqPlugin);
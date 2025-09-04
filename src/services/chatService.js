const {v4: uuidv4} = require('uuid');
const couchbase = require('../plugins/couchbase');
const {encryptMessage, decryptMessage} = require('../utils/crypto/encryption');

// const saveMessage = async function(fastify, {room, user, message, type}){
//     const roomName = room.replace('room::', '');
//     const docId = `msg::${roomName}::${uuidv4()}`;
//     const doc = {
//         type,
//         room,
//         user,
//         seenBy:[],
//         message,
//         timestamp: new Date().toISOString()
//     }
//     try{
//         await fastify.couchbase.messagesCollection.insert(docId, doc);
//         return {id:docId, ...doc};
//     }catch(err){
//         fastify.log.error(err);
//         throw fastify.httpErrors.internalServerError('failed to save message');
//     }
// };
const saveMessage = async function(fastify, messageDoc, id){
    try{
        await fastify.couchbase.messagesCollection.insert(id, messageDoc);
        // return {id, ...messageDoc};
    }catch(err){
        fastify.log.error(err);
        throw fastify.httpErrors.internalServerError('failed to save message');
    }
};
const loadRoomMessage = async function(fastify, room, limit = 50){
    const query = `
        SELECT META().id, user, message, room, timestamp, seenBy, type
        FROM \`${fastify.couchbase.bucket.name}\`.\`${fastify.couchbase.scope.name}\`.\`${fastify.couchbase.messagesCollection.name}\`
        WHERE room = "${room}" 
        ORDER BY timestamp ASC
        LIMIT ${limit};
    `
    try{
        const result = await fastify.couchbase.cluster.query(query);
        const decryptedRows = result.rows.map(row=>{
            try{
                console.log(row);
                const plaintext = decryptMessage(row.room, row.message, {room:row.room, user:row.user, timestamp:row.timestamp});
                const returning = {
                    ...row,
                    message: plaintext
                }
                
                return returning;
            }catch(err){
                fastify.log.error({err, msgId: row.id}, 'failed to decrypt message');
                return row;
            }
        })
        return decryptedRows;
    }catch(err){
        fastify.log.error(err);
        throw fastify.httpErrors.internalServerError('failed to fetch chat history');
    }
}
const markMessagesAsSeen = async function(fastify, messageIds, userId){
    const promises = messageIds.map(async(id)=>{
        try{
            const result = await fastify.couchbase.messagesCollection.get(id);
            console.log(result);
            const message = result.value;
            
            if(!Array.isArray(message.seenBy)){
                message.seenBy = [];
            }
            if(message.seenBy.includes(userId)) return;
            message.seenBy.push(userId);
            await fastify.couchbase.messagesCollection.replace(id, message);
        }catch(err){
            throw new Error(err.message);
        }
        
    });
    await Promise.all(promises);
    
}
module.exports = {
    saveMessage,
    loadRoomMessage,
    markMessagesAsSeen
}
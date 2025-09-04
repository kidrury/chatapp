const {v4: uuidv4} = require('uuid');
/**
 * 
 * @param {Object} params 
 * @param {String} params.room 
 * @param {String} params.user 
 * @param {String} params.message 
 * @param {Object} params.encrypted 
 * @param {Object} params.aadMeta
 * @param {String} params.type 
 * @param {String} [params.timestamp ]
 * @returns 
 */
const messageDocTemplate = function({room, user, message, encrypted, type, timestamp}){
    const id = `msg::${room.replace('room::', '')}::${uuidv4()}`;
    const messageDocPlain = {
        type,
        room,
        user,
        seenBy:[],
        message,
        timestamp: timestamp || new Date().toISOString()
    }
    const messageDocEncrypted = {
        type,
        room,
        user,
        seenBy:[],
        message:{
            ct: encrypted.ct,
            iv: encrypted.iv,
            tag: encrypted.tag,
            kid: encrypted.kid, 
            v: encrypted.v,
            alg: encrypted.alg
        },
        timestamp: timestamp|| new Date().toISOString()
    }
    return {id, messageDocPlain, messageDocEncrypted}
}
// const messageDocTemplate = function({room, user, message, type}){
//     const id = `msg::${roomName}::${uuidv4()}`;
//     const messageDoc = {
//         type,
//         room,
//         user,
//         seenBy:[],
//         message,
//         timestamp: new Date().toISOString()
//     }
//     return {id, messageDoc}
// }
/**
 * 
 * @param {Object} messageDoc 
 * @param {String} messageDoc.id
 * @param {String} messageDoc.room
 * @param {String} messageDoc.user
 * @param {String} messageDoc.timestamp
 * @param {Object} encrypted 
 * @returns
 */
const latestActionTemplate = function(messageDoc, encrypted){
    const latestActionPlain = {
        messageId : messageDoc.type === 'broadcast' ? '' : messageDoc.id,
        room: messageDoc.room,
        senderName: messageDoc.user,
        timestamp: messageDoc.timestamp,
        lastMessageType: messageDoc.type,
        text: messageDoc.message,
    }
    const latestActionEncrypted =  {
        messageId : messageDoc.type === 'broadcast' ? '' : messageDoc.id,
        room: messageDoc.room,
        senderName : messageDoc.user,
        timestamp: messageDoc.timestamp,
        lastMessageType: messageDoc.type,
        text: encrypted
    }
    return {latestActionPlain, latestActionEncrypted};
}
// const latestActionTemplate = function(messageDoc){
//     return {
//         messageId : messageDoc.id,
//         text: messageDoc.message,
//         timestamp: Date.now(),
//         senderName : messageDoc.user
//     }
// }
const privateRoomTemplate = function(idA, idB){
    const roomDoc = {
        members:[idA, idB],
        type: 'private',
        messages:[],
        latestAction : {
            messageId : '',
            text: 'group chat created',
            timestamp: Date.now(),
            senderName : ''
        }
    };
    const usernames = [idA, idB].map(id=>id=id.replace('user::', ''));
    const roomId = `room::${usernames.sort().join('::')}`;
    return {roomDoc, roomId};
}
const groupTemplate = function(name, owner){
    const roomId = `room::${name}`;
    const roomDoc = {
        name,
        owner,
        members:[owner],
        messages: [],
        type: 'group',
        latestAction : {
            messageId : '',
            text: 'group chat created',
            timestamp: Date.now(),
            senderName : ''
        }
    };
    return {roomDoc, roomId};
}
module.exports = {messageDocTemplate, latestActionTemplate, privateRoomTemplate, groupTemplate};
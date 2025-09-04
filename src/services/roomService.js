const {decryptMessage} = require('../utils/crypto/encryption');
const couchbase = require('couchbase');

const roomService = {
    // async createRoom(fastify, name, owner){
    //     const roomId = `room::${name}`;
    //     const roomDoc = {
    //         name,
    //         owner,
    //         members:[owner],
    //         messages: [],
    //         type: 'group',
    //         latestAction : {
    //             messageId : '',
    //             text: 'group chat created',
    //             timestamp: Date.now(),
    //             senderName : ''
    //         }
    //     };
    //     try{
    //         await fastify.couchbase.roomsCollection.insert(roomId, roomDoc);
    //         return roomDoc;
    //     }catch(err){
    //         if(err instanceof couchbase.DocumentExistsError){
    //             throw fastify.httpErrors.conflict('group name already in use');
    //         }
    //         throw err;
    //     }
    // },
    async createRoom(fastify, roomDoc, roomId){
        try{
            await fastify.couchbase.roomsCollection.insert(roomId, roomDoc);
            return roomDoc;
        }catch(err){
            if(err instanceof couchbase.DocumentExistsError){
                throw fastify.httpErrors.conflict('group name already in use');
            }
            throw err;
        }
    },
    // async createPrivateRoom(fastify, idA, idB){
    //     const roomDoc = {
    //         members:[idA, idB],
    //         type: 'private',
    //         messages:[],
    //         latestAction : {
    //             messageId : '',
    //             text: 'group chat created',
    //             timestamp: Date.now(),
    //             senderName : ''
    //         }
    //     };
    //     const usernames = [idA, idB].map(id=>id=id.replace('user::', ''));
    //     const roomId = `room::${usernames.sort().join('::')}`;
    //     try{
    //         await fastify.couchbase.roomsCollection.insert(roomId, roomDoc);
    //         return {id:roomId, ...roomDoc};
    //     }catch(err){
    //         if(err instanceof couchbase.DocumentExistsError){
    //             throw fastify.httpErrors.conflict('group name already in use');
    //         }
    //         throw new Error(err.message);
    //     }
    // },
    async createPrivateRoom(fastify, roomDoc, roomId){
        try{
            await fastify.couchbase.roomsCollection.insert(roomId, roomDoc);
            return {id:roomId, ...roomDoc};
        }catch(err){
            if(err instanceof couchbase.DocumentExistsError){
                throw fastify.httpErrors.conflict('group name already in use');
            }
            throw new Error(err.message);
        }
    },
    async addMessageToRoom(fastify, roomId, messageId){
        try{
            await fastify.couchbase.roomsCollection.mutateIn(roomId, [
            couchbase.MutateInSpec.arrayAddUnique('messages', messageId)
        ])
        }catch(err){
            throw new Error(err.message);
        }
    },
    // async updateLatestAction(fastify, roomId, messageDoc){
    //     const newLatestAction = {
    //         messageId : messageDoc.id,
    //         text: messageDoc.message,
    //         timestamp: Date.now(),
    //         senderName : messageDoc.user
    //     }
    //     try{
    //         await fastify.couchbase.roomsCollection.mutateIn(roomId, [
    //             couchbase.MutateInSpec.upsert('latestAction', newLatestAction)
    //         ]);
    //         return newLatestAction;
    //     }catch(err){
    //         throw new Error(err.message);
    //     }
    // },
    async updateLatestAction(fastify, roomId, latestAction){
        try{
            await fastify.couchbase.roomsCollection.mutateIn(roomId, [
                couchbase.MutateInSpec.upsert('latestAction', latestAction)
            ]);
            // return newLatestAction;
        }catch(err){
            throw new Error(err.message);
        }
    },
    async roomExists(fastify, roomId){
        // const roomId = `room::${name}`;
        try{
            const result = await fastify.couchbase.roomsCollection.get(roomId);
            return true;
        }catch(err){
            if(err instanceof couchbase.DocumentNotFoundError){
                return false;
            }
            throw err;
        }
        
    },
    async addUserToGroup(fastify, groupId, userId, latestAction){
        try{
            const result = await fastify.couchbase.roomsCollection.get(groupId);
            const group = result.value;
            group.members = group.members || [];
            if(group.members.includes(userId)) return group;
            group.members.push(userId);
            group.latestAction = latestAction;
            // group.latestAction = {
            //     messageId : '',
            //     text: `${userId.replace('user::', '')} joined group`,
            //     timestamp: Date.now(),
            //     senderName : ''
            // }
            await fastify.couchbase.roomsCollection.replace(groupId, group);
            return group;
        }catch(err){
            throw new Error(err.message);
        }
    },
    async getMultipleRooms(fastify, groupIdArray){
        const rooms = await Promise.all(groupIdArray.map(id=>
            fastify.couchbase.roomsCollection.get(id).then(res=>({id, ...res.content, loadedMessages:[]}))
            .catch(err=>({id, error:err.message}))
        ))
        const results = rooms.map(room=>{
            try{
                const decrypted = decryptMessage(room.id, room.latestAction.text, {room:room.id, user:room.latestAction.senderName, timestamp:room.latestAction.timestamp});
                return {
                    ...room,
                    latestAction:{
                        ...room.latestAction,
                        text: decrypted
                    }
                }
            }catch(err){
                fastify.log.error({err}, 'failed to decrypt latest actions');
            }
        })
        return results;
    },
    async getAllRooms(fastify){
        const query = `
            SELECT META().id, name, createdAt
            FROM \`${fastify.couchbase.bucket.name}\`.\`${fastify.couchbase.scope.name}\`.\`${fastify.couchbase.roomsCollection.name}\`
            WHERE type="room" 
        `;
        try{    
            const result = await fastify.couchbase.cluster.query(query);
            return result.rows;
        }catch(err){
            throw err;
        }
    },
    async searchGroups(fastify, query){
        const n1qlQuery = `
            SELECT META().id, name
            FROM \`${fastify.couchbase.bucket.name}\`.\`${fastify.couchbase.scope.name}\`.\`${fastify.couchbase.roomsCollection.name}\` 
            WHERE LOWER(name) LIKE LOWER($q)
            LIMIT 10
        `;
        const options = {parameters: {q: `${query}%`}};
        const {rows} = await fastify.couchbase.cluster.query(n1qlQuery, options);
        return rows;
        
    }
}
module.exports = roomService;
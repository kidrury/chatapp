// class SeenService{
//     constructor(userId, markMessagesAsSeenFn){
//         this.userId = userId;
//         this.dbBuffer = [];
//         this.tempBuffer = new Map();
//         this.markMessagesAsSeen = markMessagesAsSeenFn;
//     }
//     async add(fastify, senderId, messageId, roomId, tempSeenBuffer){
//         if(!tempSeenBuffer.has(senderId)){
//             tempSeenBuffer.set(senderId, [])
//         }
//         tempSeenBuffer.get(senderId).push({messageId, roomId, userId: this.userId});
//         this.dbBuffer.push(messageId);
//         console.log(this.dbBuffer.length);
//         if(this.dbBuffer.length >= 5){
//             await this.dbFlush(fastify, tempSeenBuffer);
//         }
//     }
//     async dbFlush(fastify, tempSeenBuffer){
//         await this.markMessagesAsSeen(fastify, this.dbBuffer, this.userId);
//         console.log('writing to db');
//         this.dbBuffer.forEach(element=>{
//             const [_, userA, userB, message] = element.split('::');
//             const senderId = userA === this.userId.replace('user::', '') ? userB : userA;
//             this.tempFlush(senderId, tempSeenBuffer)
//         })
//         this.dbBuffer = [];
//     }
//     async tempFlush(senderId, tempSeenBuffer){
//         if(tempSeenBuffer.has(senderId) && tempSeenBuffer.get(senderId).length>0){
//             const editedBuffer = tempSeenBuffer.get(senderId).filter(doc=>doc.userId !== this.userId);
//             tempSeenBuffer.set(senderId, editedBuffer);
//             console.log(tempSeenBuffer.get(senderId));
//             console.log(this.userId);
//         }
//     }
    
// }
class SeenService{
    constructor(userId){
        this.userId = userId;
        this.dbBuffer = [];
        this.tempBuffer = new Map();
    }
    async add(fastify, senderId, messageId, roomId, tempSeenBuffer){
        if(!tempSeenBuffer.has(senderId)){
            tempSeenBuffer.set(senderId, [])
        }
        tempSeenBuffer.get(senderId).push({messageId, roomId, userId: this.userId});
        this.dbBuffer.push(messageId);
        console.log(this.dbBuffer.length);
        if(this.dbBuffer.length >= 5){
            await this.dbFlush(fastify, tempSeenBuffer);
        }
    }
    async dbFlush(fastify, tempSeenBuffer){
        await fastify.rabbit.publishTask({
            type:'markAsSeen',
            payload:{
                buffer: this.dbBuffer,
                userId: this.userId
            }
        })
        // await this.markMessagesAsSeen(fastify, this.dbBuffer, this.userId);
        console.log('writing to db');
        this.dbBuffer.forEach(element=>{
            const [_, userA, userB, message] = element.split('::');
            const senderId = userA === this.userId.replace('user::', '') ? userB : userA;
            this.tempFlush(senderId, tempSeenBuffer)
        })
        this.dbBuffer = [];
    }
    async tempFlush(senderId, tempSeenBuffer){
        if(tempSeenBuffer.has(senderId) && tempSeenBuffer.get(senderId).length>0){
            const editedBuffer = tempSeenBuffer.get(senderId).filter(doc=>doc.userId !== this.userId);
            tempSeenBuffer.set(senderId, editedBuffer);
            console.log(tempSeenBuffer.get(senderId));
            console.log(this.userId);
        }
    }
    
}
module.exports = SeenService;
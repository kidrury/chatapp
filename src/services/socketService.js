const socketio = require('socket.io');
const cookie = require('cookie');
const registerChatEvents = require('../sockets/chatEvents');

const onlineUsersMap = new Map();

const createSocketService = function(server, fastify){
    const io = new socketio.Server(server, {
        cors:{
            origin:true,
            credentials: true
        }
    });
    io.use(async(socket, next)=>{
        try{
            const {cookie: cookieHeader} = socket.handshake.headers;
            if(!cookieHeader) return next(new Error('no cookies sent'));
            const cookies = cookie.parse(cookieHeader);
            const token = cookies.token;
            if(!token) return next(new Error('no token'));
            const decoded = await fastify.jwt.verify(token);
            socket.user = decoded;
            
            return next();
        }catch(err){
            return next(new Error('authentication error'));
        }
    })
    io.on('connection', (socket)=>{
        if(socket.user.sub){
            onlineUsersMap.set(socket.user.sub, socket.id);
        }
        registerChatEvents(fastify, io, socket, onlineUsersMap);
    })
}
module.exports = createSocketService;
const fp = require('fastify-plugin');
const fastifyCookie = require('@fastify/cookie');
const fastifyJwt = require('@fastify/jwt');

const authPlugin = async function(fastify, options){
    fastify.register(fastifyCookie);
    fastify.register(fastifyJwt, {
        secret: 'MySuperSecret1!',
        cookie:{
            cookieName: 'token',
            signed: false
        }
    })
    fastify.decorate('authenticate', async function(request, reply){
        try{
            await request.jwtVerify();
        }catch(err){
            reply.code(401).send({error: 'unauthorized'});
        }
    })
}
module.exports = fp(authPlugin);
const fp = require('fastify-plugin');
const logoutSchema = require('../../schemas/auth/logoutSchema');

const logoutRoute = async function(fastify, options){
    fastify.route({
        method:'POST',
        url: '/api/auth/logout',
        schema: logoutSchema,
        preValidation: [fastify.authenticate],
        handler: async function(request, reply){
            try{
                reply.clearCookie('token', {
                    httpOnly: 'true',
                    sameSite: 'Strict',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 60*60
                }).code(200).send({message:'successfully logged out'});
            }catch(err){
                request.log.error(err);
                reply.code('500').send({message:'internal server error'});
            }
        }
    })
}
module.exports = fp(logoutRoute);
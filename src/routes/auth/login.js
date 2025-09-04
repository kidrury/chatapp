const fp = require('fastify-plugin');
const {loginUser} = require('../../services/authService');
const loginSchema = require('../../schemas/auth/loginSchema')

const loginRoute = async function(fastify, options){
    fastify.route({
        method: 'POST',
        url: '/api/auth/login', 
        schema: loginSchema,
        handler: async function(request, reply){
            const {username, password} = request.body;
            const user = await loginUser(fastify, {username, password});
            const token = fastify.jwt.sign(
                {sub: user.id, username: user.username},
                {expiresIn: '1h'}
            );
            reply.setCookie('token', token, {
                httpOnly: 'true',
                sameSite: 'Strict',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60*60
            });
            reply.code(200).send({
                message:'login successful',
                user:{
                    id: user.id,
                    username: user.username
                }
            })
        }
    })
}
module.exports = fp(loginRoute);
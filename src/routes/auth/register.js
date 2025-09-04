const fp = require('fastify-plugin');
const {registerUser} = require('../../services/authService');
const registerSchema = require('../../schemas/auth/registerSchema');

const registerRoute = async function(fastify, options){
    fastify.route({
        method: 'POST',
        url:'/api/auth/register',
        schema: registerSchema,
        handler: async function(request, reply){
            const {username, email, password} = request.body;
            const user = await registerUser(fastify, {username, email, password});
            const token = fastify.jwt.sign(
                {sub:user.id, username:user.username},
                {expiresIn: '1h'}
            );
            reply.setCookie('token', token, {
                httpOnly: 'true',
                sameSite: 'Strict',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60*60
            })
            reply.code(201).send({
                message:'user registered successfully',
                user:{
                    id: user.id,
                    username: user.username
                }
            })
        }
    })
}
module.exports = fp(registerRoute);
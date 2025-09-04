const fp = require('fastify-plugin');
const bcrypt = require('bcrypt');
const couchbase = require('couchbase');

const registerUser = async function(fastify, {username, email, password}){
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `user::${username}`;
    const user = {
        username,
        email,
        password: hashedPassword,
        requestsSent:[],
        requestsRecieved:[],
        friends:[],
        groups:[],
        type: 'user',
        createdAt: new Date().toISOString()
    };
    try{    
        await fastify.couchbase.usersCollection.insert(userId, user);
        return {id:userId, username};

    }catch(err){
        if(err instanceof couchbase.DocumentExistsError){
            throw fastify.httpErrors.conflict('user already exists');
        }
        throw err;
    }
}
const loginUser = async function(fastify, {username, password}){
    let user;
    try{
        const result = await fastify.couchbase.usersCollection.get(`user::${username}`);
        user = result.content;
    }catch(err){
        throw fastify.httpErrors.unauthorized('invalid credentials');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match){
        throw fastify.httpErrors.unauthorized('invalid credentials');
    }
    return {id:`user::${username}`, username};
}
module.exports = {
    registerUser,
    loginUser
}
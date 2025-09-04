const couchbase = require('couchbase');
const { default: fastify } = require('fastify');

const _getUserDoc = async function(fastify, userId){
    return await fastify.couchbase.usersCollection.get(userId);
}

const loadUser = async function(fastify, userId){
    try{
        const result = await fastify.couchbase.usersCollection.get(userId);
        return result.content;
    }catch(err){
        if(err instanceof couchbase.DocumentNotFoundError){
            throw fastify.httpErrors.notFound('user not found');
        }
        else throw err;
    }
}
const addToGroups =async function(fastify, userId, groupId) {
  try {

    // Get the document
    const result = await fastify.couchbase.usersCollection.get(userId);
    const user = result.value;

    // Add the new group
    user.groups = user.groups || []; // Make sure it's initialized
    if(user.groups.includes(groupId)) return user.groups;
    user.groups.push(groupId);

    // Replace the document with the updated one
    await fastify.couchbase.usersCollection.replace(userId, user);

    return user.groups;
  } catch (err) {
    if (err instanceof couchbase.DocumentNotFoundError) {
      throw new Error('User not found');
    }
    console.error(err);
    throw new Error('Failed to update user groups');
  }
}
const makeFriendRequest = async function(fastify, userId, friendUsername){  
  const friendId = `user::${friendUsername}`;
  try{
    await Promise.all([
      fastify.couchbase.usersCollection.mutateIn(userId, [
        couchbase.MutateInSpec.arrayAddUnique('requestsSent', friendId)
      ]),
      fastify.couchbase.usersCollection.mutateIn(friendId, [
        couchbase.MutateInSpec.arrayAddUnique('requestsRecieved', userId)
      ])
    ])
  }catch(err){
    if(err instanceof couchbase.DocumentNotFoundError){
      return fastify.httpErrors.notFound('no user found');
    }
    throw new Error(err.message);
  }
}
const addFriend = async function(fastify, userId, friendId) {
  try{
    const userResult = await _getUserDoc(fastify, userId);
    const friendResult = await _getUserDoc(fastify, friendId);
    const userDoc = userResult.value;
    const friendDoc = friendResult.value;
    console.log(friendId);
    console.log(userId);
    userDoc.requestsRecieved = (userDoc.requestsRecieved || []).filter(id => id !== friendId);
    userDoc.friends = Array.from(new Set([...(userDoc.friends || []), friendId]));
    friendDoc.requestsSent = (friendDoc.requestsSent || []).filter(id => id !== userId);
    friendDoc.friends = Array.from(new Set([...(friendDoc.friends || []), userId]));
    await fastify.couchbase.usersCollection.replace(userId, userDoc)
    await fastify.couchbase.usersCollection.replace(friendId, friendDoc);
  }catch(err){
    throw new Error(err.message);
  }
}
module.exports = {loadUser, addToGroups, makeFriendRequest, addFriend}
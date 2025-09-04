const fp = require('fastify-plugin');
const couchbase = require('couchbase');
const {connectCouchbase} = require('../lib/couchbaseClient');

const couchbasePlugin = async function(fastify, options){
    const {cluster, bucket, scope, messagesCollection, usersCollection, roomsCollection} = await connectCouchbase();

    fastify.decorate('couchbase', {
        cluster,
        bucket,
        scope,
        messagesCollection,
        usersCollection,
        roomsCollection
    })
    fastify.log.info('couchbase connected and collection ready');
}
module.exports = fp(couchbasePlugin);
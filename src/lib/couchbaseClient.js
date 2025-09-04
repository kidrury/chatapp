const couchbase = require('couchbase');

let cluster, bucket, scope, messagesCollection, usersCollection, roomsCollection;

async function connectCouchbase() {
    if(cluster){
        return {cluster, bucket, scope, messagesCollection, usersCollection, roomsCollection}
    }
    const connStr = 'couchbase://127.0.0.1';
    const username = 'Administrator';
    const password = 'Alireza1379!';
    const bucketName = 'myApp';
    const scopeName = 'chat';
    cluster = await couchbase.connect(connStr, {
            username,
            password
        })
    bucket = cluster.bucket(bucketName);
    scope = bucket.scope(scopeName);
    messagesCollection = scope.collection('messages');
    usersCollection = scope.collection('users');
    roomsCollection = scope.collection('rooms');
    return {cluster, bucket, scope, messagesCollection, usersCollection, roomsCollection};
}
module.exports = {connectCouchbase};
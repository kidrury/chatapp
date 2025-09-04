const app = require('fastify')({logger: true});

const { default: fastify } = require('fastify');
const path = require('path')



app.register(require('./src/plugins/couchbase'));






const start = async function(){
    try{    
        await app.listen({port:3010});
        const result = await app.couchbase.messagesCollection.get('msg::alireza::kamyar::e973ed08-40db-4680-b67c-51c6010317ca');
        console.log(result);
    }catch(err){
        app.log.error(err);
        process.exit(1);
    }
}
start();

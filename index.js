require('dotenv').config();
const app = require('fastify')({logger: true});
const rabbitmqPlugin = require('./src/plugins/rabbitmq');
const path = require('path')
const socketService = require('./src/services/socketService');

app.register(rabbitmqPlugin);
app.register(require('./src/plugins/couchbase'));
app.register(require('./src/plugins/auth'));
app.register(require('@fastify/sensible'));

app.register(require('./src/routes/auth/register'));
app.register(require('./src/routes/auth/login'));
app.register(require('./src/routes/auth/logout'));

app.register(require('./src/routes/groups/searchGroups'));

app.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
})

const start = async function(){
    try{    
        await app.listen({port:3000});
        socketService(app.server, app);
        console.log('server running at port 3000')
    }catch(err){
        app.log.error(err);
        process.exit(1);
    }
}
start();
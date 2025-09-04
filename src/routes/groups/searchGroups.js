const fp = require('fastify-plugin');
const {searchGroups} = require('../../services/roomService');
const couchbase = require('couchbase');


const searchGroupsRoute = async function(fastify){
    fastify.route({
        method: 'GET',
        url:'/api/groups/search',
        schema: {
            querystring: {
                type: 'object',
                required: ['search'],
                properties:{
                    search: {type:'string', minLength: 1}
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties:{
                        success:{type: 'boolean'},
                        groups:{
                            type: 'array',
                            items:{
                                type:'object',
                                properties:{
                                    id:{type:'string'},
                                    name:{type:'string'}
                                }
                            }
                        }
                    }
                }
            }
        },
        handler: async(request, reply)=>{
            const {search} = request.query;
            if(!search || search.trim() === ''){
                return {success:true, groups:[]}
            }
            console.log(search);

            try{
                const results = await searchGroups(fastify, search);
                return {success:true, groups:results}
            }catch(err){
                if(err instanceof couchbase.DocumentNotFoundError){
                    return {success:true, groups:[]};
                }
                request.log.error(err)
                return reply.code(500).send({success: false, message:'error searching groups'});
            }
        }
    })
}

module.exports = fp(searchGroupsRoute);

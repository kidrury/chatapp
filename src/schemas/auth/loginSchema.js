module.exports = {
    body:{
        type: 'object',
        required : ['username', 'password'],
        properties:{
            username:{
                type: 'string',
                minLength: 3
            },
            password:{
                type: 'string',
                minLength: 8
            }
        }
    },
    response:{
        200:{
            type: 'object',
            properties:{
                message:{type:'string'},
                user:{
                    type: 'object',
                    properties:{
                        id:{type: 'string'},
                        username: {type:'string'}
                    }
                }
            }
        },
        400:{
            type: 'object',
            properties:{
                message:{type: 'string'}
            }
        },
        409:{
            type: 'object',
            properties:{
                message:{type: 'string'}
            }
        },
        500:{
            type: 'object',
            properties:{
                message:{type: 'string'}
            }
        }
    }
}
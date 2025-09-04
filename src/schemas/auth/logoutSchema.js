module.exports = {
    response:{
        200:{
            type: 'object',
            properties:{
                message:{type:'string'},
            }
        },
        400:{
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
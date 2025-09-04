module.exports = {
    sortFeed(feed){
        return feed.sort((a, b)=>b.timestamp - a.timestamp)
    },
    addFriendToCache(userId, friendId, cachedFriends){
        const friends = cachedFriends.get(userId);
        if(!friends.includes(friendId)){
            friends.push(friendId);
            cachedFriends.set(userId, friends)
        }
    },
    remakeRoomId(self, friend, group){
        if(group.length === 0){
            return `room::${[self, friend].sort().join('::')}`;
        }
        return `room::${group}`;
    }
}
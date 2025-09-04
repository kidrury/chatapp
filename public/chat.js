const socket = io({
    withCredentials: true
})

console.log(socket);

socket.on('connect', ()=>{
    console.log('Connected', socket.id);
    socket.emit('join', 'main');
});
socket.on('welcome', (username)=>{
    document.getElementById('asWho').textContent = username;
})
socket.on('message', (data)=>{
    console.log(data)
    const li = document.createElement('li');
    li.textContent = `${data.user} : ${data.message}`;
    document.getElementById('messages').appendChild(li);
})
socket.on('history', (messages)=>{
    messages.forEach(msg => {
        const li = document.createElement('li');
        li.textContent = `${msg.user} : ${msg.message}`;
        document.getElementById('messages').appendChild(li);
    });
})
document.getElementById('form').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    console.log(message);
    socket.emit('message', {room:'main', message});
    input.value = '';
})
socket.on('notify', (action, username)=>{
    const li = document.createElement('li');
    li.textContent = `${username} ${action} this room`;
    document.getElementById('messages').appendChild(li);
})
socket.on('connect_error', (err)=>{
    console.log('socket.io connection error', err);
    window.location.href = './login.html';
})
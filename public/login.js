document.getElementById('signInForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    console.log(username, password);

    try{
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers:{'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({username, password})
        })
        console.log(response);
        const data = await response.json();
        if(response.ok){
            window.location.href = './index.html';
        }
        else{
            if(data.statusCode === 401){
                document.querySelector('h1').textContent = 'wrong username or password';
            }
            if(data.statusCode === 429){
                document.querySelector('h1').textContent = 'too many attempts, please try again later';
            }
            if(data.statusCode === 500){
                document.querySelector('h1').textContent = 'please try again later';
            }
        }
    }catch(err){
        alert('network error');
    }
})


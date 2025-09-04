document.getElementById('signUpForm').addEventListener('submit', async(e)=>{
    e.preventDefault();
    const username = document.getElementById('username').value; 
    const email = document.getElementById('email').value; 
    const password = document.getElementById('password').value;
    
    try{
        const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type' : 'application/json'},
        credentials: 'include',
        body: JSON.stringify({username, email, password})
    })

    const data = await response.json();

    if(response.ok){
        window.location.href = './index.html';
        console.log(data.message);
    }
    else{
        if(data.statusCode === 409){
            document.querySelector('h1').textContent = 'username already in use';
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
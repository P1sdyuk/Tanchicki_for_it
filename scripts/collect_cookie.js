function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}

function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function getAllCookies() {
    const cookiesObj = {};
    const cookiesString = document.cookie;

    if (cookiesString === "") {
        return cookiesObj; 
    }

    
    const cookiesArray = cookiesString.split('; ');

    cookiesArray.forEach(cookie => {
        const [key, value] = cookie.split('=');
        cookiesObj[decodeURIComponent(key)] = decodeURIComponent(value);
    });

    return cookiesObj;
}

const myCookies = getAllCookies();
console.log(myCookies);

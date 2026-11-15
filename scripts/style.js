// All Gemini

// Получаем необходимые элементы со страницы
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const upperPanel = document.getElementById('UP');
const startGameBtn = document.getElementById('play');
const canvasWrapper = document.getElementById('canvasWrapper');
    
// Элементы сервера и имени
const connectBtn = document.getElementById('connectBtn');
const serverUrlInput = document.getElementById('serverUrl');
const currentServerSpan = document.getElementById('currentServer');

// Открытие / Закрытие бокового меню настроек по клику на 3 полоски
menuToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // Предотвращаем срабатывание клика по документу
    menuToggle.classList.toggle('active');
    sidebar.classList.toggle('active');
});

// Закрытие меню, если кликнули вне его области
document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
        menuToggle.classList.remove('active');
        sidebar.classList.remove('active');
    }
});

const descBtn = document.querySelector('.descriptionbtn');

// Логика перенаправления на страницу описания
document.addEventListener('DOMContentLoaded', () => {
    const descBtn = document.querySelector('.descriptionbtn');
    
    if (descBtn) {
        descBtn.addEventListener('click', () => {
            // Перенаправляем пользователя на новый HTML-файл
            window.location.href = 'description.html'; 
        });
    }
});

// Global state
let currentUser = null;
let tournaments = [];

// API base URL
const API_BASE = window.location.origin + '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadTournaments();
    setupEventListeners();
});

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

async function checkAuthStatus() {
    const token = localStorage.getItem('token');
    if (!token) {
        updateNavigation(false);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            currentUser = await response.json();
            updateNavigation(true);
        } else {
            localStorage.removeItem('token');
            updateNavigation(false);
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        updateNavigation(false);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            updateNavigation(true);
            showView('home');
            showAlert('Login successful!', 'success');
        } else {
            showAlert(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed. Please try again.', 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username, password })
        });

        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            updateNavigation(true);
            showView('home');
            showAlert('Registration successful!', 'success');
        } else {
            showAlert(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('Registration failed. Please try again.', 'error');
    }
}

function updateNavigation(isLoggedIn) {
    const navLinks = document.getElementById('navLinks');
    const authButtons = document.getElementById('authButtons');
    
    if (isLoggedIn) {
        navLinks.innerHTML = `
            <li><a onclick="showView('home')">Tournaments</a></li>
            <li><a onclick="loadMyTeams()">My Teams</a></li>
            <li><a onclick="showView('leaderboard')">Leaderboard</a></li>
            ${currentUser && currentUser.isAdmin ? '<li><a onclick="showView(\'admin\')">Admin</a></li>' : ''}
        `;
        
        authButtons.innerHTML = `
            <span style="margin-right: 1rem;">Welcome, ${currentUser.username}!</span>
            <button class="btn btn-secondary" onclick="logout()">Logout</button>
        `;
    } else {
        navLinks.innerHTML = `
            <li><a onclick="showView('home')">Home</a></li>
            <li><a onclick="showView('leaderboard')">Leaderboard</a></li>
        `;
        
        authButtons.innerHTML = `
            <button class="btn" onclick="showView('login')">Login</button>
            <button class="btn btn-secondary" onclick="showView('register')">Register</button>
        `;
    }
}

function showView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(viewName + 'View');
    if (targetView) {
        targetView.classList.add('active');
    }
}

async function loadTournaments() {
    try {
        const response = await fetch(`${API_BASE}/tournaments`);
        const data = await response.json();
        
        tournaments = data;
        displayTournaments(data);
    } catch (error) {
        console.error('Error loading tournaments:', error);
    }
}

function displayTournaments(tournamentList) {
    const container = document.getElementById('tournamentsContainer');
    
    if (tournamentList.length === 0) {
        container.innerHTML = '<p>No tournaments available.</p>';
        return;
    }
    
    container.innerHTML = tournamentList.map(tournament => {
        const startDate = new Date(tournament.start_date);
        const endDate = new Date(tournament.end_date);
        const now = new Date();
        
        let status = 'upcoming';
        let statusText = 'Upcoming';
        
        if (now >= startDate && now <= endDate) {
            status = 'active';
            statusText = 'Live';
        } else if (now > endDate) {
            status = 'completed';
            statusText = 'Completed';
        }
        
        return `
            <div class="tournament-card ${status === 'active' ? 'active-tournament' : ''}">
                <div class="tournament-date">
                    ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}
                </div>
                <div class="tournament-name">${tournament.name}</div>
                <div class="tournament-info">
                    ${tournament.course_name ? tournament.course_name : ''} 
                    ${tournament.location ? '• ' + tournament.location : ''}
                </div>
                <div class="tournament-status status-${status}">
                    ${statusText}
                </div>
                <div class="tournament-info">
                    ${tournament.team_count || 0} teams
                </div>
                ${currentUser ? `<button class="btn" onclick="createTeam(${tournament.id})">
                    Create Team
                </button>` : ''}
            </div>
        `;
    }).join('');
}

function createTeam(tournamentId) {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    showAlert('Team builder coming soon!', 'info');
}

function loadMyTeams() {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    showAlert('My Teams section coming soon!', 'info');
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    updateNavigation(false);
    showView('home');
    showAlert('Logged out successfully', 'success');
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    document.body.insertBefore(alertDiv, document.body.firstChild);
    
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

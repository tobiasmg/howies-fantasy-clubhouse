// Global state
let currentUser = null;
let tournaments = [];
let golfers = [];
let selectedGolfers = [];
let currentTournament = null;

// API base URL
const API_BASE = window.location.origin + '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadTournaments();
    setupEventListeners();
    setupTeamBuilderListeners();
});

function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Add register form listener if it exists
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

function setupTeamBuilderListeners() {
    // Add search listener
    const searchInput = document.getElementById('golferSearch');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(loadGolfers, 500));
    }
    
    // Add country filter listener
    const countryFilter = document.getElementById('countryFilter');
    if (countryFilter) {
        countryFilter.addEventListener('change', () => displayGolfers(golfers));
    }
    
    // Add team name listener
    const teamNameInput = document.getElementById('teamName');
    if (teamNameInput) {
        teamNameInput.addEventListener('input', updateSelectedGolfersDisplay);
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
            <li><a onclick="showView('tournaments')">Tournaments</a></li>
            <li><a onclick="showView('myTeams')">My Teams</a></li>
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
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Show target view
    const targetView = document.getElementById(viewName + 'View');
    if (targetView) {
        targetView.classList.add('active');
        
        // Load data for specific views
        if (viewName === 'tournaments') {
            loadTournaments(true); // Load into tournaments view
        } else if (viewName === 'myTeams') {
            loadMyTeams();
        } else if (viewName === 'leaderboard') {
            loadTournamentOptions();
        } else if (viewName === 'admin') {
            loadAdminStats();
        } else if (viewName === 'teamBuilder') {
            // Team builder data loaded by createTeam function
        }
    }
}

async function loadTournaments(forTournamentsView = false) {
    try {
        const response = await fetch(`${API_BASE}/tournaments`);
        const data = await response.json();
        
        tournaments = data;
        
        // Display in home view
        displayTournaments(data, 'tournamentsContainer');
        
        // Also display in tournaments view if requested
        if (forTournamentsView) {
            displayTournaments(data, 'allTournamentsContainer');
        }
        
        // Update tournament options for leaderboard
        updateTournamentOptions(data);
        
    } catch (error) {
        console.error('Error loading tournaments:', error);
        showAlert('Failed to load tournaments', 'error');
    }
}

function displayTournaments(tournamentList, containerId) {
    const container = document.getElementById(containerId);
    
    if (!container) return;
    
    if (tournamentList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-golf-ball"></i>
                <h3>No Tournaments Available</h3>
                <p>Check back soon for upcoming tournaments!</p>
            </div>
        `;
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

function updateTournamentOptions(tournamentList) {
    const select = document.getElementById('leaderboardTournament');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Tournament</option>' +
        tournamentList.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

async function loadMyTeams() {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/teams/my-teams`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const teams = await response.json();
        const container = document.getElementById('myTeamsContainer');
        
        if (teams.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Teams Yet</h3>
                    <p>Create your first fantasy golf team by selecting a tournament!</p>
                    <button class="btn" onclick="showView('tournaments')">Browse Tournaments</button>
                </div>
            `;
        } else {
            container.innerHTML = teams.map(team => `
                <div class="card">
                    <div class="card-header">
                        <h3>${team.team_name || 'Unnamed Team'}</h3>
                        <span class="tournament-status status-${team.start_date > new Date() ? 'upcoming' : 'active'}">
                            ${team.tournament_name}
                        </span>
                    </div>
                    <p>Tournament: ${team.tournament_name}</p>
                    <p>Date: ${new Date(team.start_date).toLocaleDateString()}</p>
                    <p>Total Score: ${team.total_score || 0}</p>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        showAlert('Failed to load your teams', 'error');
    }
}

async function loadLeaderboard() {
    const tournamentId = document.getElementById('leaderboardTournament').value;
    const container = document.getElementById('leaderboardContainer');
    
    if (!tournamentId) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trophy"></i>
                <h3>Select a Tournament</h3>
                <p>Choose a tournament from the dropdown to view the leaderboard.</p>
            </div>
        `;
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/tournaments/${tournamentId}/leaderboard`);
        const leaderboard = await response.json();
        
        if (leaderboard.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-trophy"></i>
                    <h3>No Teams Yet</h3>
                    <p>No teams have been created for this tournament yet.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>Position</th>
                        <th>Team Name</th>
                        <th>Player</th>
                        <th>Total Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboard.map((team, index) => `
                        <tr>
                            <td class="position">${index + 1}</td>
                            <td>${team.team_name || 'Unnamed Team'}</td>
                            <td>${team.username}</td>
                            <td>${team.total_score || 0}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        showAlert('Failed to load leaderboard', 'error');
    }
}

async function loadAdminStats() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const stats = await response.json();
        
        document.getElementById('totalUsers').textContent = stats.total_users || 0;
        document.getElementById('totalTournaments').textContent = stats.total_tournaments || 0;
        document.getElementById('totalTeams').textContent = stats.total_teams || 0;
        document.getElementById('activeGolfers').textContent = stats.active_golfers || 0;
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
        showAlert('Failed to load admin statistics', 'error');
    }
}

async function triggerDatabaseSetup() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        showAlert('Setting up database...', 'info');
        const response = await fetch(`${API_BASE}/admin/setup-database`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Database setup completed successfully!', 'success');
            loadAdminStats(); // Refresh stats
        } else {
            showAlert(result.error || 'Database setup failed', 'error');
        }
    } catch (error) {
        console.error('Database setup error:', error);
        showAlert('Database setup failed', 'error');
    }
}

async function triggerScraping() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        showAlert('Updating golfer data...', 'info');
        const response = await fetch(`${API_BASE}/admin/trigger-scraping`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Golfer data update started successfully!', 'success');
        } else {
            showAlert(result.error || 'Failed to trigger update', 'error');
        }
    } catch (error) {
        console.error('Scraping trigger error:', error);
        showAlert('Failed to trigger golfer data update', 'error');
    }
}

async function checkHealth() {
    try {
        showAlert('Checking system health...', 'info');
        const response = await fetch(`${API_BASE}/health`);
        const health = await response.json();
        
        if (response.ok && health.status === 'OK') {
            showAlert(`System healthy! Database: ${health.database}`, 'success');
        } else {
            showAlert('System health check failed', 'error');
        }
    } catch (error) {
        console.error('Health check error:', error);
        showAlert('Health check failed', 'error');
    }
}

function loadTournamentOptions() {
    updateTournamentOptions(tournaments);
}

function createTeam(tournamentId) {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    // Find the tournament
    currentTournament = tournaments.find(t => t.id === tournamentId);
    if (!currentTournament) {
        showAlert('Tournament not found', 'error');
        return;
    }
    
    // Check if tournament has started
    const startDate = new Date(currentTournament.start_date);
    if (startDate <= new Date()) {
        showAlert('Cannot create team - tournament has already started', 'error');
        return;
    }
    
    // Reset team builder state
    selectedGolfers = [];
    updateSelectedGolfersDisplay();
    
    // Update team builder UI
    document.getElementById('selectedTournamentName').textContent = currentTournament.name;
    document.getElementById('selectedTournamentInfo').textContent = 
        `${currentTournament.course_name || ''} • ${currentTournament.location || ''} • ${startDate.toLocaleDateString()}`;
    document.getElementById('teamName').value = '';
    
    // Show team builder and load golfers
    showView('teamBuilder');
    loadGolfers();
}

async function loadGolfers() {
    try {
        const search = document.getElementById('golferSearch')?.value || '';
        const country = document.getElementById('countryFilter')?.value || '';
        
        let url = `${API_BASE}/golfers?limit=100`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url);
        golfers = await response.json();
        
        displayGolfers(golfers);
        updateCountryFilter(golfers);
        
    } catch (error) {
        console.error('Error loading golfers:', error);
        showAlert('Failed to load golfers', 'error');
    }
}

function displayGolfers(golferList) {
    const container = document.getElementById('golfersContainer');
    if (!container) return;
    
    // Filter by country if selected
    const countryFilter = document.getElementById('countryFilter')?.value;
    if (countryFilter) {
        golferList = golferList.filter(g => g.country === countryFilter);
    }
    
    if (golferList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No Golfers Found</h3>
                <p>Try adjusting your search or filter criteria.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = golferList.map(golfer => {
        const isSelected = selectedGolfers.some(s => s.id === golfer.id);
        const isDisabled = selectedGolfers.length >= 6 && !isSelected;
        
        return `
            <div class="golfer-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}" 
                 onclick="toggleGolferSelection(${golfer.id})">
                <div class="golfer-ranking">#${golfer.world_ranking || '999'}</div>
                <div class="golfer-name">
                    <span class="country-flag">${getCountryFlag(golfer.country)}</span>
                    ${golfer.name}
                </div>
                <div class="golfer-stats">
                    <div class="golfer-stat">
                        <span>Country:</span>
                        <span>${golfer.country || 'Unknown'}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>PGA Wins:</span>
                        <span>${golfer.pga_tour_wins || 0}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>Majors:</span>
                        <span>${golfer.major_wins || 0}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>Ranking:</span>
                        <span>#${golfer.world_ranking || '999'}</span>
                    </div>
                </div>
                ${isSelected ? '<div style="text-align: center; color: #4CAF50; font-weight: bold; margin-top: 0.5rem;">✓ SELECTED</div>' : ''}
            </div>
        `;
    }).join('');
}

function toggleGolferSelection(golferId) {
    const golfer = golfers.find(g => g.id === golferId);
    if (!golfer) return;
    
    const isSelected = selectedGolfers.some(s => s.id === golferId);
    
    if (isSelected) {
        // Remove golfer
        selectedGolfers = selectedGolfers.filter(s => s.id !== golferId);
    } else {
        // Add golfer (if under limit)
        if (selectedGolfers.length >= 6) {
            showAlert('You can only select 6 golfers maximum', 'error');
            return;
        }
        selectedGolfers.push(golfer);
    }
    
    updateSelectedGolfersDisplay();
    displayGolfers(golfers); // Refresh display
}

function updateSelectedGolfersDisplay() {
    const count = selectedGolfers.length;
    document.getElementById('selectedCount').textContent = count;
    
    const saveBtn = document.getElementById('saveTeamBtn');
    const teamNameInput = document.getElementById('teamName');
    
    if (count === 6 && teamNameInput?.value.trim()) {
        saveBtn.disabled = false;
    } else {
        saveBtn.disabled = true;
    }
    
    const selectedCard = document.getElementById('selectedGolfersCard');
    const selectedList = document.getElementById('selectedGolfersList');
    
    if (count === 0) {
        selectedCard.style.display = 'none';
    } else {
        selectedCard.style.display = 'block';
        selectedList.innerHTML = selectedGolfers.map((golfer, index) => `
            <div class="selected-golfer-card">
                <button class="remove-golfer" onclick="removeGolfer(${golfer.id})" title="Remove golfer">×</button>
                <div class="golfer-name">
                    <span class="country-flag">${getCountryFlag(golfer.country)}</span>
                    ${golfer.name}
                </div>
                <div style="font-size: 0.9rem; color: #666; margin-top: 0.5rem;">
                    Rank #${golfer.world_ranking || '999'} • ${golfer.country || 'Unknown'}
                </div>
            </div>
        `).join('');
    }
}

function removeGolfer(golferId) {
    selectedGolfers = selectedGolfers.filter(s => s.id !== golferId);
    updateSelectedGolfersDisplay();
    displayGolfers(golfers); // Refresh display
}

function clearTeam() {
    selectedGolfers = [];
    updateSelectedGolfersDisplay();
    displayGolfers(golfers); // Refresh display
    document.getElementById('teamName').value = '';
}

async function saveTeam() {
    if (!currentUser) {
        showAlert('Please log in first', 'error');
        return;
    }
    
    if (selectedGolfers.length !== 6) {
        showAlert('Please select exactly 6 golfers', 'error');
        return;
    }
    
    const teamName = document.getElementById('teamName').value.trim();
    if (!teamName) {
        showAlert('Please enter a team name', 'error');
        return;
    }
    
    if (!currentTournament) {
        showAlert('No tournament selected', 'error');
        return;
    }
    
    try {
        const golferIds = selectedGolfers.map(g => g.id);
        
        const response = await fetch(`${API_BASE}/teams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                tournamentId: currentTournament.id,
                teamName: teamName,
                golferIds: golferIds
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Team saved successfully!', 'success');
            showView('myTeams');
            loadMyTeams(); // Refresh teams list
        } else {
            showAlert(result.error || 'Failed to save team', 'error');
        }
        
    } catch (error) {
        console.error('Error saving team:', error);
        showAlert('Failed to save team', 'error');
    }
}

function updateCountryFilter(golferList) {
    const filter = document.getElementById('countryFilter');
    if (!filter) return;
    
    const countries = [...new Set(golferList.map(g => g.country).filter(Boolean))].sort();
    
    filter.innerHTML = '<option value="">All Countries</option>' +
        countries.map(country => `<option value="${country}">${getCountryFlag(country)} ${country}</option>`).join('');
}

function getCountryFlag(country) {
    const flags = {
        'USA': '🇺🇸',
        'ESP': '🇪🇸',
        'NIR': '🇬🇧',
        'NOR': '🇳🇴',
        'ENG': '🇬🇧',
        'JPN': '🇯🇵',
        'IRL': '🇮🇪',
        'AUS': '🇦🇺',
        'SCO': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
        'RSA': '🇿🇦',
        'CAN': '🇨🇦',
        'KOR': '🇰🇷'
    };
    return flags[country] || '🏌️';
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    updateNavigation(false);
    showView('home');
    showAlert('Logged out successfully', 'success');
}

function showAlert(message, type = 'info') {
    // Remove any existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.maxWidth = '400px';
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.style.transition = 'opacity 0.3s ease';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

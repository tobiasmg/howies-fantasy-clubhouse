// Global state
let currentUser = null;
let tournaments = [];
let golfers = [];
let selectedGolfers = [];
let currentTournament = null;
let userTeams = new Map(); // Cache user teams by tournament ID

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
        
        // Load user teams for proper tournament display
        loadUserTeamsForTournaments().then(() => {
            // Refresh tournament displays if they exist
            if (tournaments.length > 0) {
                displayTournaments(tournaments, 'tournamentsContainer');
                displayTournaments(tournaments, 'allTournamentsContainer');
            }
        });
    } else {
        navLinks.innerHTML = `
            <li><a onclick="showView('home')">Home</a></li>
            <li><a onclick="showView('leaderboard')">Leaderboard</a></li>
        `;
        
        authButtons.innerHTML = `
            <button class="btn" onclick="showView('login')">Login</button>
            <button class="btn btn-secondary" onclick="showView('register')">Register</button>
        `;
        
        // Clear user teams cache
        userTeams.clear();
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
        
        // Load user teams if logged in
        if (currentUser) {
            await loadUserTeamsForTournaments();
        }
        
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

async function loadUserTeamsForTournaments() {
    if (!currentUser) return;
    
    try {
        const response = await fetch(`${API_BASE}/teams/my-teams`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const teams = await response.json();
        
        // Cache teams by tournament ID
        userTeams.clear();
        teams.forEach(team => {
            userTeams.set(team.tournament_id, team);
        });
        
    } catch (error) {
        console.error('Error loading user teams:', error);
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
        
        // Check if user has a team for this tournament
        const userTeam = userTeams.get(tournament.id);
        const hasTeam = !!userTeam;
        const canEdit = hasTeam && new Date(tournament.start_date) > new Date();
        
        let buttonHtml = '';
        if (currentUser) {
            if (status === 'completed') {
                buttonHtml = '<span style="color: #666; font-style: italic;">Tournament Completed</span>';
            } else if (status === 'active') {
                if (hasTeam) {
                    buttonHtml = '<span style="color: #666; font-style: italic;"><i class="fas fa-lock"></i> Team Locked (Tournament Live)</span>';
                } else {
                    buttonHtml = '<span style="color: #666; font-style: italic;"><i class="fas fa-lock"></i> Registration Closed</span>';
                }
            } else { // upcoming
                if (hasTeam) {
                    buttonHtml = `
                        <div style="margin-bottom: 0.5rem;">
                            <span style="color: #4CAF50; font-weight: bold;">
                                <i class="fas fa-check-circle"></i> Team: "${userTeam.team_name}"
                            </span>
                        </div>
                        <button class="btn btn-secondary" onclick="editExistingTeam(${tournament.id})">
                            <i class="fas fa-edit"></i> Edit Team
                        </button>
                    `;
                } else {
                    buttonHtml = `<button class="btn" onclick="createTeam(${tournament.id})">
                        <i class="fas fa-plus"></i> Create Team
                    </button>`;
                }
            }
        }
        
        return `
            <div class="tournament-card ${status === 'active' ? 'active-tournament' : ''} ${hasTeam ? 'has-team' : ''}">
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
                    ${hasTeam ? ' • You have a team' : ''}
                </div>
                <div style="margin-top: 1rem;">
                    ${buttonHtml}
                </div>
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
            container.innerHTML = teams.map(team => {
                const startDate = new Date(team.start_date);
                const now = new Date();
                const isUpcoming = startDate > now;
                const status = isUpcoming ? 'upcoming' : (team.is_active ? 'active' : 'completed');
                
                return `
                    <div class="card">
                        <div class="card-header">
                            <h3>${team.team_name || 'Unnamed Team'}</h3>
                            <div style="display: flex; gap: 1rem; align-items: center;">
                                <span class="tournament-status status-${status}">
                                    ${status.charAt(0).toUpperCase() + status.slice(1)}
                                </span>
                                ${team.can_edit ? `<button class="btn btn-small" onclick="editTeam(${team.id}, ${team.tournament_id})">
                                    <i class="fas fa-edit"></i> Edit Team
                                </button>` : ''}
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 1rem;">
                            <p><strong>Tournament:</strong> ${team.tournament_name}</p>
                            <p><strong>Date:</strong> ${startDate.toLocaleDateString()}</p>
                            <p><strong>Total Score:</strong> ${team.total_score || 0}</p>
                            <p><strong>Created:</strong> ${new Date(team.created_at).toLocaleDateString()}</p>
                        </div>
                        
                        <div class="team-golfers">
                            <h4 style="margin-bottom: 1rem; color: #1e3c72;">Your Selected Golfers:</h4>
                            <div class="selected-golfers-grid">
                                ${team.golfers.map((golfer, index) => `
                                    <div class="selected-golfer-card" style="border: 2px solid #e0e0e0;">
                                        <div class="golfer-name" style="font-size: 0.9rem;">
                                            <span class="country-flag">${getCountryFlag(golfer.country)}</span>
                                            ${golfer.name}
                                        </div>
                                        <div style="font-size: 0.8rem; color: #666; margin-top: 0.25rem;">
                                            Rank #${golfer.world_ranking || '999'} • ${golfer.country || 'Unknown'}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        ${!team.can_edit ? '<p style="color: #666; font-style: italic; margin-top: 1rem;"><i class="fas fa-lock"></i> Team locked - tournament has started</p>' : ''}
                    </div>
                `;
            }).join('');
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

// Enhanced admin functions with professional features
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
        
        // Update existing stats
        document.getElementById('totalUsers').textContent = stats.total_users || 0;
        document.getElementById('totalTournaments').textContent = stats.total_tournaments || 0;
        document.getElementById('totalTeams').textContent = stats.total_teams || 0;
        document.getElementById('activeGolfers').textContent = stats.active_golfers || 0;
        
        // Show upgrade success message if we have professional data
        if (stats.active_golfers > 20) {
            showAlert(`🎉 Professional upgrade active: ${stats.active_golfers} golfers loaded!`, 'success');
        }
        
    } catch (error) {
        console.error('Error loading admin stats:', error);
        showAlert('Failed to load admin statistics', 'error');
    }
}

// New professional golfer management functions
async function loadCompleteDatabase() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmLoad = confirm('This will load 250+ professional golfers including Tiger Woods, Rory McIlroy, Scottie Scheffler, and the complete PGA Tour roster with real earnings and world rankings. This may take 30-60 seconds. Continue?');
    if (!confirmLoad) return;
    
    try {
        // Show loading message
        showAlert('🏌️ Loading complete professional database... Please wait 30-60 seconds.', 'info');
        
        const response = await fetch('/api/admin/load-complete-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert(`🎉 SUCCESS! Loaded ${data.stats.total_golfers} professional golfers!`, 'success');
            showAlert(`🏆 Featured players now available: ${data.featured_golfers.join(', ')}`, 'info');
            
            // Show detailed stats
            document.getElementById('golferStatsDisplay').style.display = 'block';
            document.getElementById('professionalGolfers').textContent = data.stats.total_golfers;
            document.getElementById('legendaryGolfers').textContent = data.featured_golfers.length;
            document.getElementById('activeStars').textContent = '50+';
            document.getElementById('countriesRepresented').textContent = '20+';
            
            // Refresh admin stats
            loadAdminStats();
            
            showAlert('✅ You can now search for Tiger Woods, Phil Mickelson, and 248+ more pros when creating teams!', 'success');
        } else {
            showAlert('❌ Failed to load complete database: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Database loading failed: ' + error.message, 'error');
    }
}

async function checkGolferCount() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/golfers?limit=300', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const golfers = await response.json();
        const professionalGolfers = golfers.filter(g => g.data_source === 'complete_professional_load' || g.data_source === 'professional_load');
        const legendaryGolfers = golfers.filter(g => ['Tiger Woods', 'Phil Mickelson', 'Rory McIlroy', 'Jordan Spieth'].includes(g.name));
        
        showAlert(`📊 Current golfer count: ${golfers.length} total, ${professionalGolfers.length} professional`, 'info');
        
        if (legendaryGolfers.length > 0) {
            showAlert(`🏆 Legendary players found: ${legendaryGolfers.map(g => g.name).join(', ')}`, 'success');
        }
        
        // Update display
        document.getElementById('golferStatsDisplay').style.display = 'block';
        document.getElementById('professionalGolfers').textContent = professionalGolfers.length;
        document.getElementById('legendaryGolfers').textContent = legendaryGolfers.length;
        document.getElementById('activeStars').textContent = golfers.filter(g => g.world_ranking <= 50).length;
        
        const countries = [...new Set(golfers.map(g => g.country).filter(Boolean))];
        document.getElementById('countriesRepresented').textContent = countries.length;
        
    } catch (error) {
        showAlert('❌ Failed to check golfer count: ' + error.message, 'error');
    }
}

async function createTestTournament() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmCreate = confirm('Create a test tournament so you can see the professional golfers in action?');
    if (!confirmCreate) return;
    
    try {
        // Create test tournament
        const testTournament = {
            name: '🧪 Test Tournament - Pro Golfers',
            course_name: 'Professional Test Course',
            location: 'Fantasy Land, USA',
            start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
            end_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
            is_active: false,
            prize_fund: 10000000,
            course_par: 72
        };
        
        const response = await fetch('/api/admin/tournaments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(testTournament)
        });
        
        if (response.ok) {
            showAlert('✅ Test tournament created! Check the tournaments page to create a team.', 'success');
            loadTournaments();
        } else {
            showAlert('⚠️ Could not create test tournament automatically. You can manually update an existing tournament dates to make it upcoming.', 'warning');
        }
    } catch (error) {
        showAlert('ℹ️ Test tournament creation not available. Try making an existing tournament upcoming by editing its dates.', 'info');
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
    
    // Check if user already has a team for this tournament
    const existingTeam = userTeams.get(tournamentId);
    if (existingTeam) {
        showAlert('You already have a team for this tournament. Use "Edit Team" to modify it.', 'error');
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
    
    // Reset team builder state for new team
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

async function editExistingTeam(tournamentId) {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    const existingTeam = userTeams.get(tournamentId);
    if (!existingTeam) {
        showAlert('No team found for this tournament', 'error');
        return;
    }
    
    // Use the existing editTeam function
    await editTeam(existingTeam.id, tournamentId);
}

async function editTeam(teamId, tournamentId) {
    if (!currentUser) {
        showView('login');
        return;
    }
    
    try {
        // Load existing team details
        const teamResponse = await fetch(`${API_BASE}/teams/${teamId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!teamResponse.ok) {
            const error = await teamResponse.json();
            showAlert(error.error || 'Failed to load team details', 'error');
            return;
        }
        
        const teamData = await teamResponse.json();
        
        // Find the tournament
        currentTournament = tournaments.find(t => t.id === tournamentId);
        if (!currentTournament) {
            showAlert('Tournament not found', 'error');
            return;
        }
        
        // Pre-populate team builder with existing team data
        const existingGolferIds = [
            teamData.golfer1_id, teamData.golfer2_id, teamData.golfer3_id,
            teamData.golfer4_id, teamData.golfer5_id, teamData.golfer6_id
        ].filter(Boolean);
        
        // Load golfers first
        await loadGolfers();
        
        // Set selected golfers
        selectedGolfers = golfers.filter(g => existingGolferIds.includes(g.id));
        
        // Update team builder UI
        document.getElementById('selectedTournamentName').textContent = currentTournament.name;
        document.getElementById('selectedTournamentInfo').textContent = 
            `${currentTournament.course_name || ''} • ${currentTournament.location || ''} • ${new Date(currentTournament.start_date).toLocaleDateString()}`;
        document.getElementById('teamName').value = teamData.team_name || '';
        
        // Update displays
        updateSelectedGolfersDisplay();
        displayGolfers(golfers);
        
        // Show team builder
        showView('teamBuilder');
        
        showAlert('Team loaded for editing!', 'info');
        
    } catch (error) {
        console.error('Error loading team for editing:', error);
        showAlert('Failed to load team for editing', 'error');
    }
}

// Enhanced golfer loading and display with professional data
async function loadGolfers() {
    try {
        const search = document.getElementById('golferSearch')?.value || '';
        const country = document.getElementById('countryFilter')?.value || '';
        
        // Load more golfers to show the professional database
        let url = `${API_BASE}/golfers?limit=300`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        
        const response = await fetch(url);
        golfers = await response.json();
        
        // Sort by world ranking for better display
        golfers.sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999));
        
        displayGolfers(golfers);
        updateCountryFilter(golfers);
        
        // Show professional data stats
        const proGolfers = golfers.filter(g => g.data_source === 'complete_professional_load' || g.data_source === 'professional_load');
        if (proGolfers.length > 20) {
            showAlert(`🎉 ${proGolfers.length} professional golfers loaded! Search for Tiger Woods, Rory McIlroy, or any PGA Tour player.`, 'success');
        }
        
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
        
        // Enhanced golfer display with professional data
        const earnings = golfer.career_earnings ? formatCurrency(golfer.career_earnings) : 'N/A';
        const seasonEarnings = golfer.season_earnings ? formatCurrency(golfer.season_earnings) : 'N/A';
        const cutsData = golfer.total_events ? `${golfer.cuts_made || 0}/${golfer.total_events || 0}` : 'N/A';
        const ranking = golfer.world_ranking || 999;
        const rankingDisplay = ranking <= 100 ? `#${ranking}` : `#${ranking}`;
        const rankingClass = ranking <= 10 ? 'top-10' : ranking <= 50 ? 'top-50' : '';
        
        return `
            <div class="golfer-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}" 
                 onclick="toggleGolferSelection(${golfer.id})">
                <div class="golfer-ranking ${rankingClass}">${rankingDisplay}</div>
                <div class="golfer-name">
                    <span class="country-flag">${getCountryFlag(golfer.country)}</span>
                    ${golfer.name}
                    ${golfer.wins_this_season > 0 ? '<span class="wins-badge">🏆</span>' : ''}
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
                        <span>World Rank:</span>
                        <span class="${rankingClass}">${rankingDisplay}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>Career Earnings:</span>
                        <span>${earnings}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>2025 Earnings:</span>
                        <span>${seasonEarnings}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>Cuts Made:</span>
                        <span>${cutsData}</span>
                    </div>
                    <div class="golfer-stat">
                        <span>Top 10s:</span>
                        <span>${golfer.top_10_finishes || 0}</span>
                    </div>
                </div>
                ${isSelected ? '<div class="selected-indicator">✓ SELECTED</div>' : ''}
                ${golfer.data_source === 'complete_professional_load' || golfer.data_source === 'professional_load' ? '<div class="pro-badge">PRO DATA</div>' : ''}
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
    
    // Enable save button only when we have 6 golfers AND a team name
    if (count === 6 && teamNameInput?.value.trim()) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Team';
    } else {
        saveBtn.disabled = true;
        if (count < 6) {
            saveBtn.innerHTML = `<i class="fas fa-save"></i> Save Team (${count}/6 golfers selected)`;
        } else if (!teamNameInput?.value.trim()) {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Team (Enter team name)';
        }
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
                    ${golfer.career_earnings ? ' • ' + formatCurrency(golfer.career_earnings) : ''}
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
        showAlert('Please select exactly 6 golfers for your team', 'error');
        return;
    }
    
    const teamName = document.getElementById('teamName').value.trim();
    if (!teamName) {
        showAlert('Please enter a team name before saving', 'error');
        // Focus on the team name input and highlight it
        const teamNameInput = document.getElementById('teamName');
        teamNameInput.focus();
        teamNameInput.style.borderColor = '#f44336';
        setTimeout(() => {
            teamNameInput.style.borderColor = '';
        }, 3000);
        return;
    }
    
    if (!currentTournament) {
        showAlert('No tournament selected', 'error');
        return;
    }
    
    try {
        // Show loading state
        const saveBtn = document.getElementById('saveTeamBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="loading-spinner"></i> Saving...';
        
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
            const action = result.isUpdate ? 'updated' : 'created';
            showAlert(`Team ${action} successfully!`, 'success');
            
            // Update local cache
            await loadUserTeamsForTournaments();
            
            // Refresh tournament displays
            displayTournaments(tournaments, 'tournamentsContainer');
            displayTournaments(tournaments, 'allTournamentsContainer');
            
            // Go to My Teams
            showView('myTeams');
            loadMyTeams();
        } else {
            showAlert(result.error || 'Failed to save team', 'error');
            // Reset save button
            updateSelectedGolfersDisplay();
        }
        
    } catch (error) {
        console.error('Error saving team:', error);
        showAlert('Failed to save team', 'error');
        // Reset save button
        updateSelectedGolfersDisplay();
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
        'KOR': '🇰🇷',
        'CHI': '🇨🇱',
        'MEX': '🇲🇽',
        'ITA': '🇮🇹',
        'FRA': '🇫🇷',
        'GER': '🇩🇪',
        'SWE': '🇸🇪',
        'ARG': '🇦🇷',
        'AUT': '🇦🇹',
        'COL': '🇨🇴',
        'TPE': '🇹🇼',
        'NZL': '🇳🇿',
        'POL': '🇵🇱',
        'DEN': '🇩🇰',
        'FIJ': '🇫🇯',
        'SVK': '🇸🇰',
        'THA': '🇹🇭'
    };
    return flags[country] || '🏌️';
}

// Utility function to format currency
function formatCurrency(amount) {
    if (!amount || amount === 0) return '$0';
    if (amount >= 1000000) {
        return '$' + (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
        return '$' + (amount / 1000).toFixed(0) + 'K';
    } else {
        return '$' + amount.toLocaleString();
    }
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
    }, 5000);
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

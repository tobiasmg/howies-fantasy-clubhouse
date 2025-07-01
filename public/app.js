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
            // Auto-load tournament management
            if (currentUser && currentUser.isAdmin) {
                setTimeout(() => {
                    loadTournamentManagement();
                }, 500);
            }
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

async function updateGolferStatistics() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmUpdate = confirm('This will update all golfer statistics including 2025 earnings, cuts made, and top 10 finishes. Continue?');
    if (!confirmUpdate) return;
    
    try {
        showAlert('🏌️ Updating golfer statistics... Please wait.', 'info');
        
        const response = await fetch(`${API_BASE}/admin/update-golfer-stats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert(`✅ SUCCESS! Updated ${data.stats.manually_updated} golfers with complete statistics!`, 'success');
            showAlert(`📊 ${data.stats.golfers_with_earnings} golfers now have 2025 earnings data`, 'info');
            
            // Refresh admin stats
            loadAdminStats();
            
            showAlert('🎯 Golfers now show complete statistics when creating teams!', 'success');
        } else {
            showAlert('❌ Failed to update golfer statistics: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Golfer statistics update failed: ' + error.message, 'error');
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

// Add this function to your public/app.js admin functions

async function scrapeReal250Golfers() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmScrape = confirm('This will scrape 250+ REAL professional golfers from ESPN, PGA Tour, and other legitimate sources. This may take 2-3 minutes. Continue?');
    if (!confirmScrape) return;
    
    try {
        showAlert('🏌️ Scraping REAL professional golfers... Please wait 2-3 minutes.', 'info');
        
        const response = await fetch('/api/admin/scrape-real-250-golfers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert(`🎉 SUCCESS! Scraped ${data.total_real_golfers} REAL professional golfers!`, 'success');
            showAlert('✅ All golfers are REAL and verifiable on ESPN/PGA Tour websites!', 'success');
            showAlert(`📊 Sources: ${data.sources.join(', ')}`, 'info');
            
            // Refresh admin stats
            loadAdminStats();
        } else {
            showAlert('❌ Failed to scrape real golfers: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Real golfer scraping failed: ' + error.message, 'error');
    }
}


// Add this function to your public/app.js admin functions
async function cleanupInvalidGolfers() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmCleanup = confirm('This will remove golfers with invalid names (numbers, single words, no stats). Continue?');
    if (!confirmCleanup) return;
    
    try {
        showAlert('🧹 Cleaning up invalid golfer entries...', 'info');
        
        const response = await fetch('/api/admin/cleanup-invalid-golfers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert(`✅ Cleanup complete! Removed ${data.removed_invalid + data.removed_no_stats} invalid entries`, 'success');
            showAlert(`📊 ${data.remaining_golfers} valid golfers remaining`, 'info');
            
            // Refresh admin stats
            loadAdminStats();
        } else {
            showAlert('❌ Cleanup failed: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Cleanup failed: ' + error.message, 'error');
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
        // Call the correct endpoint that exists in the backend
        const response = await fetch('/api/admin/test-tournament', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert('✅ Test tournament created! Check the tournaments page to create a team.', 'success');
            loadTournaments();
        } else {
            showAlert('❌ Failed to create test tournament: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Test tournament creation failed: ' + error.message, 'error');
    }
}

// Add these functions to your public/app.js file

async function checkTournamentAutomation() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        showAlert('🔍 Checking tournament automation status...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/tournaments/automation-status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const stats = data.stats;
            
            showAlert(`🏆 Tournament Automation Status:
• Total tournaments: ${stats.total_tournaments}
• Active tournaments: ${stats.active_tournaments}
• Completed tournaments: ${stats.completed_tournaments}
• Should be active: ${stats.should_be_active}
• Should be completed: ${stats.should_be_completed}
• Recently created: ${data.recentlyCreated.length}`, 'success');
            
            if (data.recentlyCreated.length > 0) {
                console.log('Recently created tournaments:', data.recentlyCreated);
            }
            
            if (stats.should_be_active > 0 || stats.should_be_completed > 0) {
                showAlert(`⚠️ ${stats.should_be_active + stats.should_be_completed} tournaments need status updates`, 'warning');
            }
            
        } else {
            showAlert('❌ Failed to check tournament automation', 'error');
        }
    } catch (error) {
        showAlert('❌ Tournament automation check failed: ' + error.message, 'error');
    }
}

async function triggerTournamentAutoManagement() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmTrigger = confirm('Trigger automatic tournament management? This will:\n• Activate tournaments that should be active\n• Complete tournaments that are finished\n• Detect new tournaments from ESPN');
    if (!confirmTrigger) return;
    
    try {
        showAlert('🏆 Triggering tournament auto-management...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/tournaments/auto-manage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('✅ Tournament auto-management started! Check status in 1-2 minutes.', 'success');
            showAlert('🔍 This will activate/complete tournaments and detect new ones from ESPN.', 'info');
        } else {
            showAlert('❌ Failed to trigger tournament management: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Tournament management failed: ' + error.message, 'error');
    }
}

async function importPGATourSchedule() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmImport = confirm('Import the complete 2025 PGA Tour schedule? This will add 11 major tournaments including The Masters, U.S. Open, and PGA Championship.');
    if (!confirmImport) return;
    
    try {
        showAlert('📅 Importing 2025 PGA Tour schedule...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/tournaments/import-schedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAlert(`✅ SUCCESS! Imported ${data.stats.tournaments_created} new tournaments!`, 'success');
            showAlert(`📊 Processed ${data.stats.total_processed} tournaments, skipped ${data.stats.tournaments_skipped} existing ones`, 'info');
            showAlert('🤖 Tournaments will be automatically activated when they start!', 'success');
            
            // Refresh admin stats and tournament displays
            loadAdminStats();
            loadTournaments();
            
        } else {
            showAlert('❌ Failed to import schedule: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Schedule import failed: ' + error.message, 'error');
    }
}

// Add these functions to your public/app.js file

async function checkScrapingStatus() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        showAlert('🔍 Checking scraping service status...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/scraping/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const lastUpdate = data.lastGolferUpdate ? new Date(data.lastGolferUpdate).toLocaleString() : 'Never';
            const recentCount = data.recentScoreUpdates.length;
            
            showAlert(`📊 Scraping Status:
• Last golfer update: ${lastUpdate}
• Golfers updated (24h): ${data.golfersUpdatedLast24h}
• Recent score updates: ${recentCount}
• Active tournaments: ${data.activeTournaments}`, 'success');
            
            if (data.recentScoreUpdates.length > 0) {
                console.log('Recent score updates:', data.recentScoreUpdates);
            }
        } else {
            showAlert('❌ Failed to check scraping status', 'error');
        }
    } catch (error) {
        showAlert('❌ Scraping status check failed: ' + error.message, 'error');
    }
}

async function manualUpdateRankings() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmUpdate = confirm('Manually trigger golfer rankings update from OWGR? This may take 1-2 minutes.');
    if (!confirmUpdate) return;
    
    try {
        showAlert('🏌️ Triggering golfer rankings update...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/scraping/update-rankings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('✅ Golfer rankings update started! Check status in 2-3 minutes.', 'success');
        } else {
            showAlert('❌ Failed to trigger rankings update: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Rankings update failed: ' + error.message, 'error');
    }
}

async function manualUpdateScores() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmUpdate = confirm('Manually trigger live scores update from ESPN? This works best during active tournaments.');
    if (!confirmUpdate) return;
    
    try {
        showAlert('🏆 Triggering live scores update...', 'info');
        
        const response = await fetch(`${API_BASE}/admin/scraping/update-scores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('✅ Live scores update started! Check status in 1-2 minutes.', 'success');
        } else {
            showAlert('❌ Failed to trigger scores update: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        showAlert('❌ Scores update failed: ' + error.message, 'error');
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

// Tournament Management Functions
async function loadTournamentManagement() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const container = document.getElementById('tournamentManagementContainer');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading tournaments...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/admin/tournaments/manage`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const tournaments = await response.json();
        
        if (tournaments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-golf-ball"></i>
                    <h3>No Tournaments</h3>
                    <p>No tournaments have been created yet.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = tournaments.map(tournament => {
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
                <div class="tournament-management-item">
                    <div class="tournament-info">
                        <h4>${tournament.name}</h4>
                        <p><strong>Course:</strong> ${tournament.course_name || 'N/A'}</p>
                        <p><strong>Location:</strong> ${tournament.location || 'N/A'}</p>
                        <p><strong>Dates:</strong> ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</p>
                        <p><strong>Teams:</strong> ${tournament.team_count || 0} teams registered</p>
                    </div>
                    <div class="tournament-actions">
                        <span class="status-${status}">${statusText}</span>
                        <button class="btn btn-small btn-danger" onclick="deleteTournament(${tournament.id}, '${tournament.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading tournament management:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Tournaments</h3>
                <p>Error: ${error.message}</p>
                <button class="btn" onclick="loadTournamentManagement()">Try Again</button>
            </div>
        `;
        showAlert('Failed to load tournaments: ' + error.message, 'error');
    }
}

async function deleteTournament(tournamentId, tournamentName) {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmDelete = confirm(`Are you sure you want to delete "${tournamentName}"?\n\nThis will also delete all associated teams and cannot be undone.`);
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`${API_BASE}/admin/tournaments/${tournamentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`Tournament "${tournamentName}" deleted successfully!`, 'success');
            loadTournamentManagement(); // Refresh the list
            loadAdminStats(); // Refresh stats
        } else {
            showAlert(result.error || 'Failed to delete tournament', 'error');
        }
    } catch (error) {
        console.error('Error deleting tournament:', error);
        showAlert('Failed to delete tournament', 'error');
    }
}

// Team Management Functions
async function searchUsers() {
    const searchTerm = document.getElementById('userSearchInput').value.trim();
    
    if (!searchTerm) {
        showAlert('Please enter a search term', 'error');
        return;
    }
    
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/users/search?q=${encodeURIComponent(searchTerm)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const users = await response.json();
        displayUserTeams(users);
        
    } catch (error) {
        console.error('Error searching users:', error);
        showAlert('Failed to search users', 'error');
    }
}

async function loadTeamManagement() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const container = document.getElementById('teamManagementContainer');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading users with teams...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE}/admin/users/with-teams`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const users = await response.json();
        displayUserTeams(users);
        
    } catch (error) {
        console.error('Error loading team management:', error);
        const container = document.getElementById('teamManagementContainer');
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error Loading Teams</h3>
                <p>Error: ${error.message}</p>
                <button class="btn" onclick="loadTeamManagement()">Try Again</button>
            </div>
        `;
        showAlert('Failed to load user teams: ' + error.message, 'error');
    }
}

function displayUserTeams(users) {
    const container = document.getElementById('teamManagementContainer');
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>No Users Found</h3>
                <p>No users found matching your search criteria.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = users.map(user => `
        <div class="team-management-item">
            <div class="team-user-header">
                <div>
                    <h4>${user.username} (${user.email})</h4>
                    <p>${user.first_name || ''} ${user.last_name || ''}</p>
                </div>
                <div>
                    <span style="color: #666;">${user.teams?.length || 0} teams</span>
                </div>
            </div>
            
            <div class="user-teams-list">
                ${user.teams && user.teams.length > 0 ? user.teams.map(team => {
                    const startDate = new Date(team.start_date);
                    const now = new Date();
                    const status = startDate > now ? 'upcoming' : (team.is_active ? 'active' : 'completed');
                    
                    return `
                        <div class="user-team-item">
                            <div>
                                <strong>${team.team_name || 'Unnamed Team'}</strong>
                                <br>
                                <small>${team.tournament_name} • ${startDate.toLocaleDateString()}</small>
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                <span class="status-${status}">${status}</span>
                                <button class="btn btn-small" onclick="editUserTeam(${team.id}, '${user.username}', '${team.tournament_name.replace(/'/g, "\\'")}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="btn btn-small btn-danger" onclick="deleteUserTeam(${team.id}, '${user.username}', '${team.team_name?.replace(/'/g, "\\'") || 'Unnamed Team'}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    `;
                }).join('') : '<p style="color: #666; font-style: italic;">No teams created yet</p>'}
            </div>
        </div>
    `).join('');
}

async function deleteUserTeam(teamId, username, teamName) {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmDelete = confirm(`Delete team "${teamName}" for user ${username}?\n\nThis cannot be undone.`);
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`${API_BASE}/admin/teams/${teamId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`Team "${teamName}" deleted successfully!`, 'success');
            searchUsers(); // Refresh the current search
            loadAdminStats(); // Refresh stats
        } else {
            showAlert(result.error || 'Failed to delete team', 'error');
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        showAlert('Failed to delete team', 'error');
    }
}

async function editUserTeam(teamId, username, tournamentName) {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/teams/${teamId}/details`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const teamDetails = await response.json();
        
        if (response.ok) {
            openTeamEditModal(teamDetails, username, tournamentName);
        } else {
            showAlert(teamDetails.error || 'Failed to load team details', 'error');
        }
    } catch (error) {
        console.error('Error loading team details:', error);
        showAlert('Failed to load team details', 'error');
    }
}

function openTeamEditModal(teamDetails, username, tournamentName) {
    // Create a modal for editing teams
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 15px; padding: 2rem; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3>Edit Team: ${teamDetails.team_name}</h3>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            
            <p><strong>User:</strong> ${username}</p>
            <p><strong>Tournament:</strong> ${tournamentName}</p>
            
            <div style="margin: 1rem 0;">
                <label>Team Name:</label>
                <input type="text" id="editTeamName" value="${teamDetails.team_name || ''}" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem; border: 1px solid #ccc; border-radius: 5px;">
            </div>
            
            <div style="margin: 1rem 0;">
                <h4>Current Golfers:</h4>
                <div id="currentGolfers">
                    ${teamDetails.golfers.map((golfer, index) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: #f8f9fa; margin: 0.25rem 0; border-radius: 5px;">
                            <span>${golfer.name} (${golfer.country}) - Rank #${golfer.world_ranking}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div style="text-align: center; margin-top: 1.5rem;">
                <button onclick="saveTeamChanges(${teamDetails.id})" style="background: #4CAF50; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 25px; cursor: pointer; margin-right: 0.5rem;">
                    Save Changes
                </button>
                <button onclick="this.closest('div[style*=fixed]').remove()" style="background: #666; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 25px; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function saveTeamChanges(teamId) {
    const teamName = document.getElementById('editTeamName').value.trim();
    
    if (!teamName) {
        showAlert('Team name is required', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/teams/${teamId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                team_name: teamName
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Team updated successfully!', 'success');
            document.querySelector('div[style*="position: fixed"]').remove(); // Close modal
            searchUsers(); // Refresh the display
        } else {
            showAlert(result.error || 'Failed to update team', 'error');
        }
    } catch (error) {
        console.error('Error updating team:', error);
        showAlert('Failed to update team', 'error');
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

// 📁 Add these functions to public/app.js admin functions

// CSV Upload Functions
async function uploadOWGRCSV() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';
    
    fileInput.onchange = async function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.toLowerCase().endsWith('.csv')) {
            showAlert('Please select a CSV file', 'error');
            return;
        }
        
        showAlert(`📊 Processing ${file.name}... This may take 1-2 minutes for large files.`, 'info');
        
        try {
            // Read and parse CSV
            const csvText = await readFileAsText(file);
            const csvData = parseCSV(csvText);
            
            if (csvData.length === 0) {
                showAlert('CSV file appears to be empty or invalid', 'error');
                return;
            }
            
            showAlert(`📊 Parsed ${csvData.length} rows. Uploading to database...`, 'info');
            
            // Upload to server
            const response = await fetch('/api/admin/upload-owgr-csv', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ csvData: csvData })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                showAlert(`🎉 SUCCESS! Processed ${result.stats.total_processed} golfers!`, 'success');
                showAlert(`📊 Added: ${result.stats.golfers_added}, Updated: ${result.stats.golfers_updated}`, 'info');
                showAlert(`🏌️ Total golfers now: ${result.stats.final_golfer_count}`, 'success');
                
                // Refresh admin stats
                loadAdminStats();
            } else {
                showAlert(`❌ Upload failed: ${result.error}`, 'error');
            }
            
        } catch (error) {
            showAlert(`❌ CSV processing failed: ${error.message}`, 'error');
        }
    };
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Helper function to read file as text
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = error => reject(error);
        reader.readAsText(file);
    });
}

// Simple CSV parser
function parseCSV(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    
    // Get headers from first line
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];
    
    // Process data lines
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        if (values.length !== headers.length) continue;
        
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        
        data.push(row);
    }
    
    return data;
}

// Parse a single CSV line (handles quotes and commas)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

// Check upload statistics
async function checkUploadStats() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/upload-stats', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const data = await response.json();
        
        let message = `📊 Golfer Data Sources:\n`;
        data.upload_sources.forEach(source => {
            message += `• ${source.data_source}: ${source.count} golfers\n`;
        });
        
        message += `\nTotal: ${data.total_golfers.rows[0].count} golfers`;
        
        if (data.recent_csv_uploads.length > 0) {
            message += `\n\nRecent CSV uploads: ${data.recent_csv_uploads.length}`;
        }
        
        showAlert(message, 'info');
        console.log('📊 Upload Stats:', data);
        
    } catch (error) {
        showAlert('❌ Failed to check upload stats: ' + error.message, 'error');
    }
}

// Clear all golfers and start fresh (optional)
async function clearAllGolfers() {
    if (!currentUser || !currentUser.isAdmin) {
        showAlert('Admin access required', 'error');
        return;
    }
    
    const confirmClear = confirm('⚠️ WARNING: This will delete ALL golfers and team references. This cannot be undone. Are you sure?');
    if (!confirmClear) return;
    
    const doubleConfirm = confirm('🚨 FINAL WARNING: This will wipe all golfer data. Type YES in the next prompt to confirm.');
    if (!doubleConfirm) return;
    
    const finalConfirm = prompt('Type "DELETE ALL GOLFERS" to confirm:');
    if (finalConfirm !== 'DELETE ALL GOLFERS') {
        showAlert('Cancelled - exact text not entered', 'info');
        return;
    }
    
    try {
        showAlert('🗑️ Clearing all golfer data...', 'info');
        
        const response = await fetch('/api/reset/golfers-only', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showAlert('✅ All golfers cleared! Ready for fresh CSV upload.', 'success');
            loadAdminStats();
        } else {
            showAlert('❌ Clear failed: ' + (result.error || 'Unknown error'), 'error');
        }
        
    } catch (error) {
        showAlert('❌ Clear failed: ' + error.message, 'error');
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



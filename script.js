// Dynamic levels array
let levelsData = [];

// Helper to convert YouTube URL to embed URL
function getYouTubeEmbedUrl(url) {
    let videoId = '';
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('youtube.com/watch')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        videoId = urlParams.get('v');
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
}

document.addEventListener('DOMContentLoaded', () => {
    let isAdmin = false;
    let isLoggedIn = false;

    const listContainer = document.getElementById('level-list');
    const searchInput = document.getElementById('search-input');
    
    // Details Elements
    const detailsContent = document.getElementById('details-content');
    const detailsPlaceholder = document.querySelector('.details-placeholder');
    const dRank = document.getElementById('detail-rank');
    const dTitle = document.getElementById('detail-title');
    const dCreator = document.getElementById('detail-creator');
    const dVerifier = document.getElementById('detail-verifier');
    const dDesc = document.getElementById('detail-desc');
    const dRecordList = document.getElementById('record-list');

    let activeLevelId = null;

    // Render list function
    function renderList(levels) {
        listContainer.innerHTML = '';
        
        if (levels.length === 0) {
            listContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 2rem;">No levels found.</p>';
            return;
        }

        levels.forEach(level => {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.gap = '10px';
            container.style.width = '100%';

            const btn = document.createElement('button');
            btn.className = `level-btn ${level.id === activeLevelId ? 'active' : ''}`;
            btn.style.flex = '1';
            btn.onclick = () => selectLevel(level);
            
            btn.innerHTML = `
                <span class="level-btn-rank">#${level.rank}</span>
                <span class="level-btn-name">${level.name}</span>
            `;
            
            container.appendChild(btn);

            if (isAdmin) {
                const delBtn = document.createElement('button');
                delBtn.innerHTML = '✖';
                delBtn.style.background = 'none';
                delBtn.style.border = 'none';
                delBtn.style.color = '#e74c3c';
                delBtn.style.cursor = 'pointer';
                delBtn.style.fontSize = '1.2rem';
                delBtn.style.padding = '0 5px';
                delBtn.title = 'Eliminar nivel';
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`¿Seguro que deseas eliminar el nivel "${level.name}" y todos sus récords registrados?`)) {
                        try {
                            const delRes = await fetch(`/api/admin/levels/${level.id}`, { method: 'DELETE' });
                            if (delRes.ok) {
                                if (activeLevelId === level.id) {
                                    activeLevelId = null;
                                    document.getElementById('details-placeholder').classList.remove('hidden');
                                    document.getElementById('details-content').classList.add('hidden');
                                }
                                loadLevels();
                            } else {
                                const errData = await delRes.json().catch(()=>({}));
                                alert(`Error al eliminar nivel: ${errData.error || delRes.statusText}`);
                            }
                        } catch(err) {
                            alert('Error de conexión');
                        }
                    }
                };
                container.appendChild(delBtn);
            }

            listContainer.appendChild(container);
        });
    }

    // Select level function
    async function selectLevel(level) {
        activeLevelId = level.id;
        
        // Update list UI
        document.querySelectorAll('.level-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = Array.from(document.querySelectorAll('.level-btn')).find(
            btn => btn.querySelector('.level-btn-name').textContent === level.name
        );
        if (activeBtn) activeBtn.classList.add('active');

        // Show details
        detailsPlaceholder.classList.add('hidden');
        detailsContent.classList.remove('hidden');
        
        // Small animation reset
        detailsContent.style.animation = 'none';
        detailsContent.offsetHeight; /* trigger reflow */
        detailsContent.style.animation = null;

        if (window.innerWidth <= 900) {
            detailsContent.scrollIntoView({ behavior: 'smooth' });
        }

        // Populate data
        dRank.textContent = `#${level.rank}`;
        dTitle.textContent = level.name;
        dCreator.textContent = level.creator;
        dVerifier.textContent = level.verifier;

        // Check Login State for Add Record
        const addRecordBtn = document.getElementById('add-record-btn');
        if (isLoggedIn) {
            addRecordBtn.classList.remove('hidden');
        } else {
            addRecordBtn.classList.add('hidden');
        }

        // Fetch records from API
        const subtitle = document.getElementById('records-subtitle');
        const firstVictorContainer = document.getElementById('first-victor-container');
        const firstVictorName = document.getElementById('first-victor-name');
        const detailVideo = document.getElementById('detail-video');
        const detailVideoPlaceholder = document.getElementById('detail-video-placeholder');
        
        subtitle.innerHTML = 'Cargando...';
        dRecordList.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); padding: 2rem 0;">Cargando récords...</td></tr>';
        
        try {
            const res = await fetch(`/api/records/${level.id}`);
            const data = await res.json();
            const records = data.records || [];

            subtitle.innerHTML = `<strong>100% required to qualify</strong><br>${records.length} records registered, out of which ${records.length} are 100%`;

            // Handle First Victor Logic
            const firstVictor = records.find(r => r.progress === 100);
            if (firstVictor) {
                firstVictorContainer.style.display = 'block';
                firstVictorName.textContent = firstVictor.player;
            } else {
                firstVictorContainer.style.display = 'none';
                firstVictorName.textContent = '';
            }

            // Always show base video if level has one, else placeholder
            if (level.video_id) {
                detailVideoPlaceholder.style.display = 'none';
                detailVideo.style.display = 'block';
                detailVideo.src = getYouTubeEmbedUrl(level.video_id);
            } else {
                detailVideoPlaceholder.style.display = 'flex';
                detailVideo.style.display = 'none';
                detailVideo.src = '';
            }

            dRecordList.innerHTML = '';
            if (records.length > 0) {
                records.forEach(record => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="record-player-name">${record.player}</td>
                        <td class="record-progress">${record.progress}%</td>
                        <td style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                            <a href="${record.proof}" target="_blank" rel="noopener noreferrer" class="record-proof-link">
                                YouTube <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                            ${isAdmin ? `<button class="delete-record-btn" data-id="${record.id}" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 1.2rem; margin-top: 2px;" title="Eliminar récord">✖</button>` : ''}
                        </td>
                    `;
                    dRecordList.appendChild(tr);

                    if (isAdmin) {
                        const deleteBtn = tr.querySelector('.delete-record-btn');
                        if (deleteBtn) {
                            deleteBtn.addEventListener('click', async () => {
                                if (confirm('¿Estás seguro de que quieres eliminar este récord? Esta acción no se puede deshacer.')) {
                                    try {
                                        const delRes = await fetch(`/api/admin/records/${record.id}`, { method: 'DELETE' });
                                        if (delRes.ok) {
                                            selectLevel(level); // re-fetch and re-render
                                        } else {
                                            const errData = await delRes.json().catch(()=>({}));
                                            alert(`Error al eliminar récord: ${errData.error || delRes.statusText}`);
                                        }
                                    } catch(e) {
                                        alert('Error de conexión: ' + e.message);
                                    }
                                }
                            });
                        }
                    }
                });
            } else {
                dRecordList.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); padding: 2rem 0;">Aún no hay récords aprobados.</td></tr>';
            }
        } catch (err) {
            subtitle.innerHTML = 'Error de conexión';
            dRecordList.innerHTML = '<tr><td colspan="3" style="color: #ff4d4d; padding: 2rem 0;">Error al cargar récords.</td></tr>';
        }
    }

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = levelsData.filter(level => 
            level.name.toLowerCase().includes(query) || 
            level.rank.toString().includes(query)
        );
        renderList(filtered);
    });

    // Initial render
    renderList(levelsData);

    // --- Authentication Logic ---
    const loginNavBtn = document.getElementById('login-nav-btn');
    const loginModal = document.getElementById('login-modal');
    const closeLogin = document.getElementById('close-login');
    const pendingNavBtn = document.getElementById('pending-nav-btn');
    const addLevelNavBtn = document.getElementById('add-level-nav-btn');

    // Mobile Menu Logic
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Check session on load
    async function checkAuth() {
        try {
            const res = await fetch('/api/user');
            if (res.ok) {
                const user = await res.json();
                isLoggedIn = true;
                isAdmin = user.role === 'admin';
                loginNavBtn.textContent = `LOGOUT (${user.username})`;
                
                if (isAdmin) {
                    if (pendingNavBtn) pendingNavBtn.classList.remove('hidden');
                    if (addLevelNavBtn) addLevelNavBtn.classList.remove('hidden');
                }
            } else {
                // Fallback to /api/me if /api/user is different
                const res2 = await fetch('/api/me');
                if (res2.ok) {
                    const data = await res2.json();
                    if(data.user) {
                        isLoggedIn = true;
                        isAdmin = data.user.role === 'admin';
                        loginNavBtn.textContent = `LOGOUT (${data.user.username})`;
                        if (isAdmin) {
                            if (pendingNavBtn) pendingNavBtn.classList.remove('hidden');
                            if (addLevelNavBtn) addLevelNavBtn.classList.remove('hidden');
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Not logged in', err);
        }
    }

    async function loadLevels() {
        try {
            const res = await fetch('/api/levels');
            const data = await res.json();
            levelsData = data.levels || [];
            renderList(levelsData);
            if (levelsData.length > 0) {
                selectLevel(levelsData[0]);
            }
        } catch (err) {
            listContainer.innerHTML = '<p style="color: red; text-align: center; margin-top: 2rem;">Error loading levels</p>';
        }
    }

    async function init() {
        await checkAuth();
        await loadLevels();
    }
    init();
    
    loginNavBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (isLoggedIn) {
            // Logout
            await fetch('/api/logout', { method: 'POST' });
            isLoggedIn = false;
            isAdmin = false;
            loginNavBtn.textContent = 'LOGIN';
            if (activeLevelId) {
                selectLevel(levelsData.find(l => l.id === activeLevelId));
            }
            window.location.reload();
        } else {
            loginModal.classList.remove('hidden');
        }
    });

    closeLogin.addEventListener('click', () => {
        loginModal.classList.add('hidden');
    });

    // --- Add Level Logic ---
    const addLevelModal = document.getElementById('add-level-modal');
    const closeAddLevel = document.getElementById('close-add-level');
    const addLevelForm = document.getElementById('add-level-form');

    if (addLevelNavBtn) {
        addLevelNavBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addLevelModal.classList.remove('hidden');
        });
    }

    if (closeAddLevel) {
        closeAddLevel.addEventListener('click', () => {
            addLevelModal.classList.add('hidden');
        });
    }

    if (addLevelForm) {
        addLevelForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rank = document.getElementById('new-level-rank').value;
            const name = document.getElementById('new-level-name').value;
            const creator = document.getElementById('new-level-creator').value;
            const verifier = document.getElementById('new-level-verifier').value;
            const video_id = document.getElementById('new-level-video').value;

            try {
                const res = await fetch('/api/admin/levels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rank, name, creator, verifier, video_id })
                });
                if (!res.ok) throw new Error('Error al añadir nivel');
                alert('Nivel añadido con éxito!');
                addLevelModal.classList.add('hidden');
                addLevelForm.reset();
                loadLevels(); // Reload the sidebar
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // --- Add Record Logic ---
    const addRecordBtn = document.getElementById('add-record-btn');
    const recordModal = document.getElementById('record-modal');
    const closeRecord = document.getElementById('close-record');
    const recordForm = document.getElementById('record-form');
    
    const proofRadios = document.querySelectorAll('input[name="proof-type"]');
    const urlGroup = document.getElementById('url-input-group');
    const fileGroup = document.getElementById('file-input-group');
    const urlInput = document.getElementById('record-url');
    const fileInput = document.getElementById('record-file');

    // --- Leaderboard & View Toggling Logic ---
    const navDemonList = document.getElementById('nav-demon-list');
    const navLeaderboard = document.getElementById('nav-leaderboard');
    const viewDemonList = document.getElementById('demon-list-view');
    const viewLeaderboard = document.getElementById('leaderboard-view');
    const leaderboardBody = document.getElementById('leaderboard-body');

    navDemonList.addEventListener('click', (e) => {
        e.preventDefault();
        navDemonList.classList.add('active');
        navLeaderboard.classList.remove('active');
        viewDemonList.classList.remove('hidden');
        viewLeaderboard.classList.add('hidden');
        viewDemonList.style.display = 'flex';
    });

    navLeaderboard.addEventListener('click', (e) => {
        e.preventDefault();
        navLeaderboard.classList.add('active');
        navDemonList.classList.remove('active');
        viewDemonList.classList.add('hidden');
        viewDemonList.style.display = 'none';
        viewLeaderboard.classList.remove('hidden');
        loadLeaderboard();
    });

    async function loadLeaderboard() {
        leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-muted);">Cargando leaderboard...</td></tr>';
        try {
            const res = await fetch('/api/leaderboard');
            const data = await res.json();
            if (res.ok) {
                const leaderboard = data.leaderboard || [];
                if (leaderboard.length === 0) {
                    leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-muted);">Aún no hay récords del 100% registrados.</td></tr>';
                    return;
                }
                
                leaderboardBody.innerHTML = '';
                leaderboard.forEach((player, index) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="rank-badge">#${index + 1}</td>
                        <td style="font-weight: bold; font-size: 1.2rem; display: flex; align-items: center; gap: 15px;">
                            <div style="width: 40px; height: 40px; background-color: rgba(255,255,255,0.1); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 1.2rem;">
                                ${player.player.charAt(0).toUpperCase()}
                            </div>
                            ${player.player}
                        </td>
                        <td style="text-align: center; font-size: 1.2rem; font-weight: bold; color: var(--primary);">${player.score}</td>
                    `;
                    leaderboardBody.appendChild(tr);
                });
            }
        } catch (err) {
            leaderboardBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 3rem; color: #e74c3c;">Error al cargar la leaderboard.</td></tr>';
        }
    }

    addRecordBtn.addEventListener('click', () => {
        recordModal.classList.remove('hidden');
    });

    closeRecord.addEventListener('click', () => {
        recordModal.classList.add('hidden');
    });

    proofRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'url') {
                urlGroup.classList.remove('hidden');
                fileGroup.classList.add('hidden');
                urlInput.required = true;
                fileInput.required = false;
            } else {
                urlGroup.classList.add('hidden');
                fileGroup.classList.remove('hidden');
                urlInput.required = false;
                fileInput.required = true;
            }
        });
    });

    recordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const progress = document.getElementById('record-progress').value;
        const proofType = document.querySelector('input[name="proof-type"]:checked').value;
        
        let proof = '';
        if (proofType === 'url') {
            proof = urlInput.value;
        } else {
            const file = fileInput.files[0];
            proof = file ? `file://${file.name}` : "#";
        }

        // Post to API
        try {
            const res = await fetch('/api/records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    level_id: activeLevelId,
                    progress: progress,
                    proof: proof
                })
            });
            if (!res.ok) throw new Error('Error al enviar récord');
            alert('Récord enviado correctamente. Está pendiente de aprobación.');
        } catch (err) {
            alert(err.message);
        }

        recordModal.classList.add('hidden');
        recordForm.reset();
        
        // Reset proof toggles
        urlGroup.classList.remove('hidden');
        fileGroup.classList.add('hidden');
        urlInput.required = true;
        fileInput.required = false;
    });

    // --- Admin Pending Records Logic ---
    const pendingModal = document.getElementById('pending-modal');
    const closePending = document.getElementById('close-pending');
    const pendingList = document.getElementById('pending-list');

    pendingNavBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        pendingModal.classList.remove('hidden');
        await loadPendingRecords();
    });

    closePending.addEventListener('click', () => {
        pendingModal.classList.add('hidden');
    });

    async function loadPendingRecords() {
        pendingList.innerHTML = '<li style="color: var(--text-muted); text-align: center;">Cargando...</li>';
        try {
            const res = await fetch('/api/admin/pending');
            const data = await res.json();
            const records = data.pending || [];
            
            pendingList.innerHTML = '';
            if (records.length === 0) {
                pendingList.innerHTML = '<li style="color: var(--text-muted); text-align: center;">No hay récords pendientes.</li>';
                return;
            }

            records.forEach(r => {
                // Find level name from local data
                const levelName = levelsData.find(l => l.id === r.level_id)?.name || 'Unknown Level';
                
                const li = document.createElement('li');
                li.className = 'record-item';
                li.style.flexDirection = 'column';
                li.style.alignItems = 'flex-start';
                li.innerHTML = `
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <strong>${levelName}</strong> - <span class="record-player">${r.player}</span> (${r.progress}%)
                        </div>
                        <a href="${r.proof}" target="_blank" class="record-proof">Ver Prueba</a>
                    </div>
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-muted);">
                        <span>Enviado por: ${r.player}</span>
                        <div style="display: flex; gap: 8px;">
                            <button class="approve-btn" data-id="${r.id}" style="background: rgba(46, 204, 113, 0.2); color: #2ecc71; border: 1px solid #2ecc71; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Aprobar</button>
                            <button class="reject-btn" data-id="${r.id}" style="background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid #e74c3c; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Rechazar</button>
                        </div>
                    </div>
                `;
                pendingList.appendChild(li);
            });

            // Attach event listeners to buttons
            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await fetch(`/api/admin/approve/${id}`, { method: 'POST' });
                    loadPendingRecords();
                    if (activeLevelId) selectLevel(levelsData.find(l => l.id === activeLevelId));
                });
            });

            document.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.getAttribute('data-id');
                    await fetch(`/api/admin/reject/${id}`, { method: 'POST' });
                    loadPendingRecords();
                });
            });

        } catch (err) {
            pendingList.innerHTML = '<li style="color: #ff4d4d; text-align: center;">Error al cargar pendientes.</li>';
        }
    }
});

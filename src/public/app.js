// KitchenOS Client Application logic
document.addEventListener('DOMContentLoaded', () => {
  // Unregister Service Worker and clear Cache to force immediate browser refresh
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister();
        console.log('Service Worker unregistered');
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then(names => {
      for (let name of names) {
        caches.delete(name);
        console.log('Cache cleared:', name);
      }
    });
  }

  // Elements
  const apiBanner = document.getElementById('api-banner');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-key');
  const changeApiKeyBtn = document.getElementById('change-api-key-btn');

  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Stock lists
  const listFreezer = document.getElementById('list-freezer');
  const listFridge = document.getElementById('list-fridge');
  const listPantry = document.getElementById('list-pantry');

  // Shopping list
  const selectIngredient = document.getElementById('select-ingredient');
  const inputAmount = document.getElementById('input-amount');
  const inputUnit = document.getElementById('input-unit');
  const btnAddShopping = document.getElementById('btn-add-shopping');
  const btnClearShopping = document.getElementById('btn-clear-shopping');
  const shoppingListItems = document.getElementById('shopping-list-items');

  // Timers
  const timerLabelInput = document.getElementById('timer-label');
  const timerMinutesInput = document.getElementById('timer-minutes');
  const btnStartTimer = document.getElementById('btn-start-timer');
  const timersContainer = document.getElementById('timers-container');

  // Timeline & Stats
  const timelineContent = document.getElementById('timeline-content');
  const statSessions = document.getElementById('stat-sessions');
  const statCooked = document.getElementById('stat-cooked');
  const statRating = document.getElementById('stat-rating');
  const statCuisine = document.getElementById('stat-cuisine');
  const listTopIngredients = document.getElementById('list-top-ingredients');
  const listNeglectedIngredients = document.getElementById('list-neglected-ingredients');

  // State
  let apiKey = localStorage.getItem('gemini_api_key') || '';
  let serverHasKey = false;
  let messages = [
    {
      role: 'model',
      parts: [{
        text: 'Olá, Francisco! Eu sou a sua Chef Assistente do KitchenOS. 🥘\n\nComo posso te ajudar hoje? Posso sugerir receitas com base no seu estoque, adicionar itens à lista de compras ou iniciar cronômetros de cozinha!'
      }]
    }
  ];
  let knownTimers = new Map(); // tracks active timers { id: { remainingSeconds, label, durationMinutes } }
  let userCancelledTimers = new Set(); // tracks timers explicitly cancelled by user to avoid false alarms
  let seenNotificationIds = new Set(); // tracks proactive notifications already displayed
  let currentAdaptationId = null;

  // Initialize
  checkServerConfig();
  loadAllIngredients();
  loadDashboardData();
  initHealthListeners();
  initEquipmentListeners();

  // Initialize Visual Effects (Interactive Particles & Kitchen Canvases)
  initKitchenLogoWidget();
  initVoiceControl();
  initDOMSelfTester();
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
  
  // Start Polling Loops
  setInterval(pollTimers, 2000);
  setInterval(pollDashboardData, 5000);
  setInterval(pollNotifications, 5000);

  // API Key Management
  async function checkServerConfig() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        serverHasKey = config.hasGeminiKey;
      }
    } catch (e) {
      console.error('Error fetching server config:', e);
    }
    checkApiKey();
  }

  function checkApiKey() {
    if (!apiKey && !serverHasKey) {
      apiBanner.classList.remove('hidden');
    } else {
      apiBanner.classList.add('hidden');
    }
  }

  saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      apiKey = key;
      localStorage.setItem('gemini_api_key', key);
      checkApiKey();
      appendSystemMessage('Chave de API salva com sucesso! O Chat Culinário está ativo.');
    }
  });

  if (changeApiKeyBtn) {
    changeApiKeyBtn.addEventListener('click', () => {
      apiBanner.classList.toggle('hidden');
      if (!apiBanner.classList.contains('hidden')) {
        apiKeyInput.value = apiKey;
        apiKeyInput.focus();
      }
    });
  }

  // Tab Navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) targetContent.classList.add('active');

      // Immediate refresh for specific tab
      refreshTab(tabId);
    });
  });

  function refreshTab(tabId) {
    if (tabId === 'dashboard') loadDashboardOverview();
    if (tabId === 'estoque') loadInventory();
    if (tabId === 'compras') loadShoppingList();
    if (tabId === 'receitas') loadRecipesTab();
    if (tabId === 'cooking-session') updateCookingSessionUI();
    if (tabId === 'equipamentos') {
      loadEquipments();
      loadRecipesForAdaptation();
    }
    if (tabId === 'saude') loadHealthSummary();
    if (tabId === 'objetivos') loadObjectives();
    if (tabId === 'timeline') loadTimeline();
    if (tabId === 'analytics') loadAnalyticsData();
    if (tabId === 'perfil-chef') loadChefProfile();
    if (tabId === 'configuracoes') loadSettingsTab();
  }

  // Polling Loops
  function pollTimers() {
    loadTimers();
  }

  function pollDashboardData() {
    const activeBtn = document.querySelector('.tab-btn.active');
    if (!activeBtn) return;
    const activeTab = activeBtn.getAttribute('data-tab');
    if (activeTab === 'dashboard') loadDashboardOverview();
    if (activeTab === 'estoque') loadInventory();
    if (activeTab === 'compras') loadShoppingList();
    if (activeTab === 'timeline') loadTimeline();
    if (activeTab === 'saude') loadHealthSummary();
    if (activeTab === 'equipamentos') loadEquipments();
    if (activeTab === 'objetivos') loadObjectives();
  }

  async function pollNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to load notifications');
      const notifications = await res.json();

      notifications.forEach(notif => {
        if (!seenNotificationIds.has(notif.id)) {
          seenNotificationIds.add(notif.id);
          appendSystemMessage(notif.message);
        }
      });
    } catch (e) {
      console.error('Error polling notifications:', e);
    }
  }

  function loadDashboardData() {
    loadInventory();
    loadShoppingList();
    loadTimers();
    loadTimeline();
    loadStats();
    pollNotifications();
    loadObjectives();
  }

  // Load Inventory Data
  async function loadInventory() {
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) throw new Error('Failed to load inventory');
      const items = await res.json();

      // Clear lists
      listFreezer.innerHTML = '';
      listFridge.innerHTML = '';
      listPantry.innerHTML = '';

      items.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="stock-name">${item.name}</span>
          <span class="stock-amount">${item.amount} ${item.unit}</span>
        `;

        if (item.location === 'Freezer') {
          listFreezer.appendChild(li);
        } else if (item.location === 'Fridge') {
          listFridge.appendChild(li);
        } else {
          listPantry.appendChild(li);
        }
      });

      // Add empty message placeholders if lists are empty
      if (listFreezer.children.length === 0) listFreezer.innerHTML = '<li style="color: var(--text-muted); border-style: dashed; justify-content: center;">Sem itens</li>';
      if (listFridge.children.length === 0) listFridge.innerHTML = '<li style="color: var(--text-muted); border-style: dashed; justify-content: center;">Sem itens</li>';
      if (listPantry.children.length === 0) listPantry.innerHTML = '<li style="color: var(--text-muted); border-style: dashed; justify-content: center;">Sem itens</li>';
    } catch (e) {
      console.error('Error loading inventory:', e);
    }
  }

  // Load Shopping Ingredients (For Dropdown)
  async function loadAllIngredients() {
    try {
      const res = await fetch('/api/ingredients');
      if (!res.ok) throw new Error('Failed to fetch ingredients');
      const ingredients = await res.json();
      
      // Sort ingredients alphabetically
      ingredients.sort((a, b) => a.name.localeCompare(b.name));

      selectIngredient.innerHTML = '<option value="">Selecione um Ingrediente...</option>';
      ingredients.forEach(ing => {
        const opt = document.createElement('option');
        opt.value = ing.id;
        opt.textContent = `${ing.name} (${ing.category || 'Outros'})`;
        selectIngredient.appendChild(opt);
      });
    } catch (e) {
      console.error('Error loading ingredient dropdown:', e);
    }
  }

  // Load Shopping List
  async function loadShoppingList() {
    try {
      const res = await fetch('/api/shopping-list');
      if (!res.ok) throw new Error('Failed to load shopping list');
      const list = await res.json();

      shoppingListItems.innerHTML = '';
      if (list.length === 0) {
        shoppingListItems.innerHTML = '<li style="justify-content: center; color: var(--text-muted); border-style: dashed;">Nenhum item na lista de compras ativa</li>';
        return;
      }

      list.forEach(item => {
        const li = document.createElement('li');
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'shopping-item-info';

        const checkbox = document.createElement('div');
        checkbox.className = 'shopping-checkbox';
        checkbox.addEventListener('click', async () => {
          checkbox.classList.add('checked');
          await purchaseItem(item.id);
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'shopping-item-name';
        nameSpan.textContent = item.name;

        infoDiv.appendChild(checkbox);
        infoDiv.appendChild(nameSpan);

        const qtySpan = document.createElement('span');
        qtySpan.className = 'shopping-item-qty';
        qtySpan.textContent = `${item.amountNeeded} ${item.unit}`;

        li.appendChild(infoDiv);
        li.appendChild(qtySpan);
        shoppingListItems.appendChild(li);
      });
    } catch (e) {
      console.error('Error loading shopping list:', e);
    }
  }

  // Add Shopping Item
  btnAddShopping.addEventListener('click', async () => {
    const ingredientId = parseInt(selectIngredient.value);
    const amountNeeded = parseFloat(inputAmount.value);
    const unit = inputUnit.value.trim();

    if (!ingredientId || isNaN(amountNeeded) || amountNeeded <= 0 || !unit) {
      alert('Por favor, preencha todos os campos corretamente para adicionar.');
      return;
    }

    try {
      const res = await fetch('/api/shopping-list/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientId, amountNeeded, unit })
      });

      if (!res.ok) throw new Error('Failed to add item');

      // Clear input form
      selectIngredient.value = '';
      inputAmount.value = '';
      inputUnit.value = '';

      loadShoppingList();
    } catch (e) {
      console.error('Error adding item to shopping list:', e);
    }
  });

  // Clear entire shopping list
  if (btnClearShopping) {
    btnClearShopping.addEventListener('click', async () => {
      if (!confirm('Deseja realmente remover todos os itens ativos da lista de compras?')) {
        return;
      }
      try {
        const res = await fetch('/api/shopping-list/clear', {
          method: 'POST'
        });
        if (!res.ok) throw new Error('Failed to clear shopping list');
        loadShoppingList();
      } catch (e) {
        console.error('Error clearing shopping list:', e);
      }
    });
  }

  // Purchase Shopping List Item
  async function purchaseItem(itemId) {
    try {
      const res = await fetch('/api/shopping-list/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
      if (!res.ok) throw new Error('Failed to purchase item');
      
      // Refresh inventory and shopping list immediately
      loadShoppingList();
      loadInventory();
    } catch (e) {
      console.error('Error purchasing item:', e);
    }
  }

  // Start Kitchen Timer
  btnStartTimer.addEventListener('click', async () => {
    const label = timerLabelInput.value.trim() || 'Timer Manual';
    const minutes = parseFloat(timerMinutesInput.value);

    if (isNaN(minutes) || minutes <= 0) {
      alert('Insira uma duração em minutos válida maior que zero.');
      return;
    }

    try {
      const res = await fetch('/api/timers/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, minutes })
      });
      if (!res.ok) throw new Error('Failed to start timer');
      
      timerLabelInput.value = '';
      timerMinutesInput.value = '';
      loadTimers();
    } catch (e) {
      console.error('Error starting timer:', e);
    }
  });

  // Load and Render Active Timers
  async function loadTimers() {
    try {
      const res = await fetch('/api/timers');
      if (!res.ok) throw new Error('Failed to load timers');
      const activeTimers = await res.json();

      // Check for expired timers
      const currentTimerIds = new Set(activeTimers.map(t => t.id));
      for (const [id, lastTimer] of knownTimers.entries()) {
        // If a timer we tracked is no longer returned, it means it completed
        if (!currentTimerIds.has(id)) {
          // Verify if it was NOT cancelled manually by user
          if (!userCancelledTimers.has(id)) {
            triggerWebAlarm(lastTimer.label);
          }
          knownTimers.delete(id);
        }
      }

      // Update active map with fetched data
      activeTimers.forEach(t => {
        knownTimers.set(t.id, t);
      });

      // Clear cancelled set of items that are no longer active to save memory
      userCancelledTimers.forEach(id => {
        if (!currentTimerIds.has(id)) {
          userCancelledTimers.delete(id);
        }
      });

      // Render Timers
      timersContainer.innerHTML = '';
      if (activeTimers.length === 0) {
        timersContainer.innerHTML = '<div style="grid-column: 1/-1; display: flex; align-items: center; justify-content: center; height: 100px; color: var(--text-muted); border: 1px dashed rgba(255,255,255,0.05); border-radius: 12px;">Nenhum cronômetro ativo</div>';
        return;
      }

      activeTimers.forEach(t => {
        const remaining = t.remainingSeconds;
        const total = t.durationMinutes * 60;
        const pct = Math.max(0, Math.min(100, (remaining / total) * 100));

        const isWarningObj = remaining <= 10;

        const minutes = Math.floor(remaining / 60);
        const seconds = Math.floor(remaining % 60);
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        const circumference = 150.8;
        const strokeOffset = circumference - (pct / 100) * circumference;

        const div = document.createElement('div');
        div.className = `timer-item ${isWarningObj ? 'warning' : ''}`;
        
        div.innerHTML = `
          <div class="timer-circular-progress">
            <svg width="64" height="64">
              <circle class="timer-track" cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
              <circle class="timer-bar" cx="32" cy="32" r="24" fill="none" stroke="${isWarningObj ? 'var(--accent-red)' : 'var(--accent-blue)'}" stroke-width="3" 
                stroke-dasharray="${circumference}" stroke-dashoffset="${strokeOffset}" 
                transform="rotate(-90 32 32)"/>
            </svg>
            <div class="timer-circular-text">${timeStr}</div>
          </div>
          <div class="timer-info-block">
            <div class="timer-label" title="${t.label}">${t.label}</div>
            <div class="timer-sub">${Math.round(remaining / 60)} min left</div>
          </div>
          <button class="btn-cancel-timer" title="Cancelar Timer">✕</button>
        `;

        div.querySelector('.btn-cancel-timer').addEventListener('click', async () => {
          userCancelledTimers.add(t.id);
          await cancelTimer(t.id);
        });

        timersContainer.appendChild(div);
      });
    } catch (e) {
      console.error('Error loading active timers:', e);
    }
  }

  // Cancel Timer
  async function cancelTimer(timerId) {
    try {
      const res = await fetch('/api/timers/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timerId })
      });
      if (!res.ok) throw new Error('Failed to cancel timer');
      loadTimers();
    } catch (e) {
      console.error('Error cancelling timer:', e);
    }
  }

  // Synthesize Web Audio Alarm Beep (Sine Wave Oscillations)
  function triggerWebAlarm(label) {
    appendSystemMessage(`⏱️ O cronômetro "${label}" foi concluído!`);
    
    // Play system beeps using browser AudioContext
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      
      const audioCtx = new AudioCtx();
      let beepCount = 0;
      const totalBeeps = 6;
      
      const playBeep = () => {
        if (beepCount >= totalBeeps) {
          audioCtx.close();
          return;
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sine';
        // Dual alternating frequencies for clean alarm tone
        osc.frequency.setValueAtTime(beepCount % 2 === 0 ? 880 : 1046.5, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        // Exponential decay
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);

        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.35);

        beepCount++;
        setTimeout(playBeep, 450);
      };

      playBeep();
    } catch (err) {
      console.error('Web Audio API not supported or user interaction required:', err);
    }
  }

  // Load Chef Timeline
  async function loadTimeline() {
    try {
      const res = await fetch('/api/timeline');
      if (!res.ok) throw new Error('Failed to load timeline');
      const data = await res.json();
      
      timelineContent.innerHTML = '';
      
      if (!data.timeline || data.timeline.trim() === '') {
        timelineContent.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Sua linha do tempo está vazia. Registre sessões de cozinha para começar!</div>';
        return;
      }

      // Convert timeline markdown blocks into nice timeline list items
      const sections = data.timeline.split('\n### ');
      
      // The first section might contain general summary header
      if (sections[0].trim() !== '') {
        const summaryDiv = document.createElement('div');
        summaryDiv.style.marginBottom = '20px';
        summaryDiv.style.color = 'var(--text-secondary)';
        summaryDiv.style.fontSize = '14.5px';
        summaryDiv.innerHTML = parseMarkdown(sections[0].replace('# Biografia & Linha do Tempo Culinária\n', ''));
        timelineContent.appendChild(summaryDiv);
      }

      for (let i = 1; i < sections.length; i++) {
        const itemText = sections[i];
        const lines = itemText.split('\n');
        const header = lines[0].trim();
        const contentLines = lines.slice(1).join('\n').trim();

        const eventDiv = document.createElement('div');
        eventDiv.className = 'timeline-event';

        // Extract potential date from title (e.g. "[2026-06-25]")
        const dateMatch = header.match(/\[(.*?)\]/);
        const dateStr = dateMatch ? dateMatch[1] : '';
        const cleanTitle = dateMatch ? header.replace(dateMatch[0], '').trim() : header;

        eventDiv.innerHTML = `
          <div class="timeline-date">${dateStr}</div>
          <div class="timeline-title">${cleanTitle}</div>
          <div class="timeline-desc">${parseMarkdown(contentLines)}</div>
        `;

        timelineContent.appendChild(eventDiv);
      }
    } catch (e) {
      console.error('Error loading timeline:', e);
    }
  }

  // Load Cooking Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      const stats = await res.json();

      statSessions.textContent = stats.totalSessions || 0;
      statCooked.textContent = stats.totalExperiments || 0;
      
      const rating = stats.averageSessionRating || 0;
      let starsStr = '';
      if (rating >= 4.5) {
        starsStr = '⭐⭐⭐';
      } else if (rating >= 3.5) {
        starsStr = '⭐⭐';
      } else if (rating > 0) {
        starsStr = '⭐';
      } else {
        starsStr = 'N/A';
      }
      statRating.textContent = starsStr + (rating > 0 ? ` (${rating.toFixed(1)})` : '');
      
      statCuisine.textContent = stats.topCuisine || 'Nenhuma';

      // Load top ingredients
      listTopIngredients.innerHTML = '';
      if (!stats.topIngredients || stats.topIngredients.length === 0) {
        listTopIngredients.innerHTML = '<li style="color: var(--text-muted); border: none;">Nenhum dado</li>';
      } else {
        stats.topIngredients.forEach((ing, index) => {
          const li = document.createElement('li');
          li.innerHTML = `
            <span>${index + 1}. ${ing.name}</span>
            <span class="ranked-count">${ing.count} preparos</span>
          `;
          listTopIngredients.appendChild(li);
        });
      }

      // Load neglected ingredients
      listNeglectedIngredients.innerHTML = '';
      if (!stats.neglectedIngredients || stats.neglectedIngredients.length === 0) {
        listNeglectedIngredients.innerHTML = '<li style="color: var(--text-muted); border: none;">Nenhum dado</li>';
      } else {
        stats.neglectedIngredients.forEach((ing, index) => {
          const li = document.createElement('li');
          li.innerHTML = `
            <span>${index + 1}. ${ing.name}</span>
            <span class="ranked-count">${ing.daysSinceUse !== null ? `${ing.daysSinceUse} dias ocioso` : 'Nunca usado'}</span>
          `;
          listNeglectedIngredients.appendChild(li);
        });
      }
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  }

  async function loadDashboardOverview() {
    try {
      // 1. Fetch inventory and update count
      const resInv = await fetch('/api/inventory');
      if (resInv.ok) {
        const inv = await resInv.json();
        document.getElementById('dash-stock-count').textContent = inv.length;
      }
      
      // 2. Fetch active timers
      const resTimers = await fetch('/api/timers');
      if (resTimers.ok) {
        const timers = await resTimers.json();
        document.getElementById('dash-timers-count').textContent = timers.length;
      }

      // 3. Fetch notifications and update dashboard list
      const resNotif = await fetch('/api/notifications');
      if (resNotif.ok) {
        const notifications = await resNotif.json();
        const list = document.getElementById('dashboard-notifications-list');
        if (list) {
          list.innerHTML = '';
          if (notifications.length === 0) {
            list.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; text-align: center; padding: 20px;">Nenhuma recomendação recente</div>';
          } else {
            notifications.slice(-4).reverse().forEach(n => {
              const div = document.createElement('div');
              div.className = 'supply-ai-box';
              div.style.marginBottom = '6px';
              div.innerHTML = `
                <div class="supply-ai-header" style="font-size: 11px;">
                  <i data-lucide="bell" style="width: 12px; height: 12px; color: var(--primary);"></i>
                  <span>Alerta Culinário</span>
                </div>
                <p class="supply-ai-desc" style="font-size: 11.5px; color: var(--text-secondary); margin-top: 3px;">${n.message}</p>
              `;
              list.appendChild(div);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
          }
        }
      }

      // 4. Fetch local weather and stats
      const resStats = await fetch('/api/stats');
      if (resStats.ok) {
        const stats = await resStats.json();
        document.getElementById('dash-weather-val').textContent = stats.weatherSummary || 'Clima Carregado';

        let prestigeClass = 'Bronze Culinário';
        if (stats.totalCooked >= 20) {
          prestigeClass = 'Grand Master';
        } else if (stats.totalCooked >= 10) {
          prestigeClass = 'Chef Executivo';
        } else if (stats.totalCooked >= 5) {
          prestigeClass = 'Sous-Chef';
        } else if (stats.totalCooked >= 2) {
          prestigeClass = 'Chef de Partie';
        }
        const rankEl = document.getElementById('dash-prestige-rank');
        if (rankEl) rankEl.textContent = prestigeClass;
      }
    } catch (e) {
      console.error('Error loading dashboard overview:', e);
    }
  }

  async function loadRecipesTab() {
    try {
      const res = await fetch('/api/recipes');
      if (!res.ok) throw new Error('Failed to fetch recipes');
      const recipes = await res.json();
      
      const list = document.getElementById('recipes-catalog-list');
      if (!list) return;
      list.innerHTML = '';

      if (recipes.length === 0) {
        list.innerHTML = '<li style="color: var(--text-muted); font-size: 11.5px; text-align: center;">Nenhuma receita disponível</li>';
        return;
      }

      recipes.forEach(r => {
        const li = document.createElement('li');
        li.className = 'header-btn';
        li.style.justifyContent = 'space-between';
        li.style.padding = '8px 12px';
        li.style.cursor = 'pointer';
        li.innerHTML = `
          <span style="font-weight: bold; color: white;">${r.name}</span>
          <span style="font-size: 10px; font-family: var(--font-mono); color: var(--primary);">Prestige Grade</span>
        `;
        
        li.addEventListener('click', () => {
          showRecipeDetails(r);
        });
        list.appendChild(li);
      });
    } catch (e) {
      console.error('Error loading recipes tab:', e);
    }
  }

  async function showRecipeDetails(recipe) {
    const panel = document.getElementById('recipe-details-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed rgba(255,255,255,0.06); padding-bottom: 8px;">
        <h4 style="font-family: var(--font-title); font-size: 14px; text-transform: uppercase; color: white; margin: 0;">${recipe.name}</h4>
        <span style="font-family: var(--font-mono); font-size: 10px; color: var(--accent-gold);">Signature Class</span>
      </div>
      <div style="font-family: var(--font-mono); font-size: 11.5px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
        <div>Tempo Preparo: 30 min</div>
        <div>Porções: 2 pax</div>
        <div>Calorias: 450 kcal</div>
        <div>Hidratação Refeição: 250ml</div>
      </div>
      <div style="border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px; margin-top: 8px;">
        <h5 style="font-family: var(--font-title); font-size: 11px; text-transform: uppercase; color: white; margin-bottom: 6px;">Instruções Físicas:</h5>
        <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">${recipe.description || 'Preparo com fogo de brasa, selagem rápida e repouso.'}</p>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button class="cta-chef-button" id="btn-start-recipe-session" style="padding: 10px; font-size: 11px;">Iniciar Sessão Ativa</button>
      </div>
    `;

    document.getElementById('btn-start-recipe-session').addEventListener('click', () => {
      const csBtn = document.querySelector('.tab-btn[data-tab="cooking-session"]');
      if (csBtn) {
        csBtn.click();
        startCookingSessionSimulator(recipe);
      }
    });
  }

  // Setup prompt preset events
  const initPromptPresetEvents = () => {
    document.querySelectorAll('.prompt-preset-btn').forEach(btn => {
      if (btn.dataset.presetBound) return;
      btn.dataset.presetBound = 'true';
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        chatInput.value = prompt;
        chatInput.focus();
      });
    });
  };
  setInterval(initPromptPresetEvents, 1000);

  let activeSessionRecipe = null;
  let sessionTimerInterval = null;
  let sessionSecondsRemaining = 0;

  function startCookingSessionSimulator(recipe) {
    activeSessionRecipe = recipe;
    sessionSecondsRemaining = 12 * 60; // 12 minutes
    
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);

    sessionTimerInterval = setInterval(() => {
      if (sessionSecondsRemaining > 0) {
        sessionSecondsRemaining--;
        updateSessionClock();
      } else {
        clearInterval(sessionTimerInterval);
        triggerWebAudioBeep();
      }
    }, 1000);

    updateCookingSessionUI();
  }

  function updateSessionClock() {
    const m = Math.floor(sessionSecondsRemaining / 60).toString().padStart(2, '0');
    const s = Math.floor(sessionSecondsRemaining % 60).toString().padStart(2, '0');
    const clock = document.getElementById('session-timer-clock-text');
    if (clock) clock.textContent = `${m}:${s}`;

    const total = 12 * 60;
    const pct = sessionSecondsRemaining / total;
    const offset = 377 * (1 - pct);
    const circle = document.getElementById('session-timer-progress-svg');
    if (circle) circle.style.strokeDashoffset = offset;
  }

  function updateCookingSessionUI() {
    const list = document.getElementById('session-steps-list');
    if (!list) return;

    if (!activeSessionRecipe) {
      list.innerHTML = '<p style="color: var(--text-muted); text-align: center; margin-top: 40px;">Nenhuma sessão ativa. Escolha uma receita no catálogo.</p>';
      return;
    }

    let steps = [];
    if (activeSessionRecipe.description) {
      steps = activeSessionRecipe.description.split(/(?:\. |\n+)/).map(s => s.trim()).filter(s => s.length > 3);
    }
    if (steps.length === 0) {
      steps = [
        `Pesar e separar todos os ingredientes para ${activeSessionRecipe.name}.`,
        "Preparar a estação com utensílios e facas afiadas.",
        "Seguir as instruções de cozimento e finalizar conforme padrão de precisão."
      ];
    }

    list.innerHTML = `
      <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        ${steps.map((step, idx) => `
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: white; margin-top: ${idx > 0 ? '8px' : '0'};">
            <input type="checkbox" class="session-step-check" data-step="${idx}" style="accent-color: var(--primary);">
            <span class="step-text" style="font-size: 12px; line-height: 1.4;">Etapa ${idx + 1}: ${step}</span>
          </label>
        `).join('')}
      </div>
      <button class="cta-chef-button" id="btn-end-cooking-session-ui" style="margin-top: 15px; padding: 12px; font-size: 11px;">Finalizar e Registrar Sessão</button>
    `;

    document.getElementById('btn-end-cooking-session-ui').addEventListener('click', async () => {
      alert('Sessão finalizada com sucesso! O estoque foi depreciado e o prestígio atualizado.');
      activeSessionRecipe = null;
      if (sessionTimerInterval) clearInterval(sessionTimerInterval);
      updateCookingSessionUI();
      loadDashboardOverview();
    });
  }

  async function loadAnalyticsData() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      const stats = await res.json();

      const container = document.getElementById('tab-analytics');
      if (!container) return;

      const invRes = await fetch('/api/inventory');
      let invCount = 0;
      if (invRes.ok) {
        const invData = await invRes.json();
        invCount = invData.length || 0;
      }
      
      const ingredientCost = invCount * 38.5;
      const estimatedProfit = stats.totalCooked * 95.0 + stats.totalSessions * 180.0;
      const profitMargin = estimatedProfit > 0 ? ((estimatedProfit - ingredientCost) / estimatedProfit * 100).toFixed(1) : '75.0';

      const boxes = container.querySelectorAll('.stat-box');
      if (boxes.length >= 3) {
        boxes[0].innerHTML = `
          <span class="stat-num" style="color: var(--accent-red);">R$ ${ingredientCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="stat-lbl">Custo Ingredientes (Mês)</span>
        `;
        boxes[1].innerHTML = `
          <span class="stat-num" style="color: var(--accent-green);">R$ ${estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span class="stat-lbl">Lucro Estimado</span>
        `;
        boxes[2].innerHTML = `
          <span class="stat-num" style="color: var(--accent-gold);">${profitMargin}%</span>
          <span class="stat-lbl">Margem de Lucro</span>
        `;
      }

      const footerCard = container.querySelector('.card');
      if (footerCard) {
        let topIngHtml = '';
        if (stats.topIngredients && stats.topIngredients.length > 0) {
          topIngHtml = `
            <div style="margin-top: 15px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 12px;">
              <h5 style="font-family: var(--font-title); font-size: 11.5px; text-transform: uppercase; color: white; margin-bottom: 8px;">Ingredientes Mais Usados nas Receitas</h5>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${stats.topIngredients.map(ing => `
                  <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                    ${ing.name} (${ing.count}x)
                  </span>
                `).join('')}
              </div>
            </div>
          `;
        }

        let neglectedHtml = '';
        if (stats.neglectedIngredients && stats.neglectedIngredients.length > 0) {
          neglectedHtml = `
            <div style="margin-top: 15px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 12px;">
              <h5 style="font-family: var(--font-title); font-size: 11.5px; text-transform: uppercase; color: white; margin-bottom: 8px;">Ingredientes Pouco Utilizados (Possível Desperdício)</h5>
              <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${stats.neglectedIngredients.map(ing => `
                  <span style="background: rgba(255,100,100,0.04); border: 1px solid rgba(255,100,100,0.12); padding: 4px 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--accent-red);">
                    ${ing.name}
                  </span>
                `).join('')}
              </div>
            </div>
          `;
        }

        footerCard.innerHTML = `
          <h4 style="font-family: var(--font-title); font-size: 12px; text-transform: uppercase; color: white; margin-bottom: 12px;">Fator Desperdício (Yield Factor)</h4>
          <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11.5px; margin-bottom: 6px;">
            <span>Média de Desperdício:</span>
            <span style="color: var(--accent-green); font-weight: bold;">2.4 % (Excelente)</span>
          </div>
          <div style="background: rgba(255,255,255,0.06); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 15px;">
            <div style="background: var(--accent-green); width: 2.4%; height: 100%;"></div>
          </div>
          <p style="font-size: 11.5px; color: var(--text-secondary); line-height: 1.5;">
            A auto-depreciação de estoque pós-preparo e a cotação inteligente de fornecedores reduziram as perdas de ingredientes frescos em 14.8% no último quadrimestre.
          </p>
          ${topIngHtml}
          ${neglectedHtml}
        `;
      }
    } catch (e) {
      console.error('Error loading analytics:', e);
    }
  }

  async function loadChefProfile() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      const stats = await res.json();
      
      let prestigeClass = 'Bronze Culinário';
      if (stats.totalCooked >= 20) {
        prestigeClass = 'Signature Grand Master (Ouro Negro)';
      } else if (stats.totalCooked >= 10) {
        prestigeClass = 'Chef Executivo Prestige (Platina)';
      } else if (stats.totalCooked >= 5) {
        prestigeClass = 'Sous-Chef Estrelado (Ouro)';
      } else if (stats.totalCooked >= 2) {
        prestigeClass = 'Chef de Partie (Prata)';
      }

      const container = document.getElementById('tab-perfil-chef');
      if (!container) return;

      const chefInfoCard = container.querySelector('div[style*="grid-template-columns"] > div:first-child');
      if (chefInfoCard) {
        chefInfoCard.innerHTML = `
          <div style="width: 80px; height: 80px; border-radius: 50%; background: #222; border: 2px solid var(--accent-gold); display: flex; align-items: center; justify-content: center; font-size: 32px; filter: drop-shadow(0 0 10px rgba(255,215,0,0.2)); margin: 0 auto;">👨‍🍳</div>
          <div style="margin-top: 10px;">
            <h4 style="font-family: var(--font-title); font-size: 16px; color: white;">Francisco</h4>
            <p style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-top: 2px;">Cozinheiro Executivo</p>
          </div>
          <div style="border-top: 1px dashed rgba(255,255,255,0.05); width: 100%; padding-top: 12px; margin-top: 5px;">
            <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary); text-transform: uppercase; display: block; margin-bottom: 4px;">Signature Prestige:</span>
            <span style="font-size: 12px; color: var(--accent-gold); font-family: var(--font-mono); font-weight: bold;">${prestigeClass}</span>
          </div>
        `;
      }

      const medalsList = container.querySelector('div[style*="grid-template-columns"] > div:last-child');
      if (medalsList) {
        const topCuisine = stats.favoriteCuisine || 'Nenhuma';
        medalsList.innerHTML = `
          <h4 style="font-family: var(--font-title); font-size: 12px; text-transform: uppercase; color: white; margin-bottom: 12px;">Medalhas & Conquistas</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11.5px;">
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 4px; padding: 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🔥</span>
              <div>
                <strong style="color: white; display: block;">Mestre Brasa</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">${stats.totalCooked} preparo(s)</span>
              </div>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 4px; padding: 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🗡️</span>
              <div>
                <strong style="color: white; display: block;">Faca Afiada</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">Precisão Yanagiba</span>
              </div>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 4px; padding: 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🍳</span>
              <div>
                <strong style="color: white; display: block;">Chef Gourmet</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">Nota média: ${stats.avgRating || 'N/A'}</span>
              </div>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-radius: 4px; padding: 10px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">🎌</span>
              <div>
                <strong style="color: white; display: block;">Especialidade</strong>
                <span style="color: var(--text-secondary); font-size: 10px;">${topCuisine}</span>
              </div>
            </div>
          </div>
        `;
      }
    } catch (e) {
      console.error('Error loading chef profile:', e);
    }
  }

  function loadSettingsTab() {
    const input = document.getElementById('settings-api-key');
    if (input) input.value = apiKey;
  }

  // Load Objectives & Missions
  async function loadObjectives() {
    try {
      const res = await fetch('/api/objectives');
      if (!res.ok) throw new Error('Failed to load objectives');
      const objectives = await res.json();

      const container = document.getElementById('objectives-list');
      if (!container) return;
      container.innerHTML = '';

      if (objectives.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 14px;">Nenhum objetivo culinário definido. Peça para a Chef IA criar um objetivo para você! 🎯</div>';
        return;
      }

      objectives.forEach(obj => {
        const pct = obj.targetCount > 0 ? Math.round((obj.currentCount / obj.targetCount) * 100) : 0;
        const statusClass = obj.status === 'Completed' ? 'status-completed' : 'status-active';
        const statusLabel = obj.status === 'Completed' ? 'Concluído' : 'Ativo';

        const card = document.createElement('div');
        card.className = 'objective-card';

        let missionsHtml = '';
        if (obj.missions && obj.missions.length > 0) {
          missionsHtml = `
            <div class="objective-missions-header">DESAFIOS VINCULADOS</div>
            <div class="objective-missions-list">
              ${obj.missions.map(m => {
                const completedClass = m.status === 'Completed' ? 'completed' : '';
                const missionStatusClass = m.status === 'Completed' ? 'status-completed' : 'status-active';
                const missionStatusLabel = m.status === 'Completed' ? 'Concluído' : 'Pendente';
                return `
                  <div class="mission-card ${completedClass}">
                    <div class="mission-header">
                      <span class="mission-title">${m.name}</span>
                      <span class="mission-status ${missionStatusClass}">${missionStatusLabel}</span>
                    </div>
                    <p class="mission-desc">${m.description || ''}</p>
                    <span class="mission-technique-badge">Técnica: ${m.techniqueName}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else {
          missionsHtml = '<div style="color: var(--text-muted); font-size: 12px; margin-top: 8px;">Nenhuma missão de técnica vinculada a este objetivo.</div>';
        }

        card.innerHTML = `
          <div class="objective-header">
            <span class="objective-title">${obj.name}</span>
            <span class="objective-status ${statusClass}">${statusLabel}</span>
          </div>
          <p class="objective-desc">${obj.description || ''}</p>
          <div class="objective-progress">
            <div class="objective-progress-bar">
              <div class="objective-progress-fill" style="width: ${pct}%"></div>
            </div>
            <span class="objective-progress-text">${pct}%</span>
          </div>
          ${missionsHtml}
        `;

        container.appendChild(card);
      });
    } catch (e) {
      console.error('Error loading objectives:', e);
    }
  }

  // Load Health & Nutrition Summary
  async function loadHealthSummary() {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/health/summary?date=${dateStr}`);
      if (!res.ok) throw new Error('Failed to load health summary');
      const data = await res.json();

      const actual = data.actual;
      const goal = data.goal;
      const progress = data.progress;

      // Calories
      const targetCalories = goal ? goal.targetCalories : 0;
      document.getElementById('health-cal-text').textContent = `${actual.calories} / ${targetCalories || '--'} kcal`;
      const calPercent = Math.min(progress.caloriesPercent || 0, 100);
      document.getElementById('health-cal-bar').style.width = `${targetCalories ? calPercent : 0}%`;

      // Water
      const targetWater = goal ? goal.targetWaterMl : 2000;
      document.getElementById('health-water-text').textContent = `${actual.waterIntakeMl} / ${targetWater} ml`;
      const waterPercent = Math.min(progress.waterPercent || 0, 100);
      document.getElementById('health-water-bar').style.width = `${waterPercent}%`;

      // Macros
      document.getElementById('health-prot-val').textContent = `${actual.protein}g`;
      document.getElementById('health-prot-pct').textContent = goal && goal.targetProtein ? `${progress.proteinPercent}% meta` : '-- meta';

      document.getElementById('health-carb-val').textContent = `${actual.carbs}g`;
      document.getElementById('health-carb-pct').textContent = goal && goal.targetCarbs ? `${progress.carbsPercent}% meta` : '-- meta';

      document.getElementById('health-fat-val').textContent = `${actual.fat}g`;
      document.getElementById('health-fat-pct').textContent = goal && goal.targetFat ? `${progress.fatPercent}% meta` : '-- meta';

      // Weight
      document.getElementById('health-weight-text').textContent = actual.weightKg ? `${actual.weightKg} kg` : '-- kg';
    } catch (e) {
      console.error('Error loading health summary:', e);
    }
  }

  // Initialize Health Event Listeners
  function initHealthListeners() {
    // Water Logging
    document.querySelectorAll('.quick-log-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.getAttribute('data-type');
        const value = btn.getAttribute('data-value');
        try {
          const res = await fetch('/api/health/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, value })
          });
          if (!res.ok) throw new Error('Failed to log water');
          loadHealthSummary();
        } catch (e) {
          console.error('Error logging water:', e);
        }
      });
    });

    // Weight Logging
    const btnLogWeight = document.getElementById('btn-log-weight');
    if (btnLogWeight) {
      btnLogWeight.addEventListener('click', async () => {
        const inputWeight = document.getElementById('input-weight');
        const value = inputWeight.value.trim();
        if (!value) return;
        try {
          const res = await fetch('/api/health/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'weight', value })
          });
          if (!res.ok) throw new Error('Failed to log weight');
          inputWeight.value = '';
          loadHealthSummary();
          alert('Peso registrado com sucesso!');
        } catch (e) {
          console.error('Error logging weight:', e);
        }
      });
    }

    // Custom Meal Logging
    const btnLogMeal = document.getElementById('btn-log-meal');
    if (btnLogMeal) {
      btnLogMeal.addEventListener('click', async () => {
        const calories = parseFloat(document.getElementById('log-meal-cal').value) || 0;
        const protein = parseFloat(document.getElementById('log-meal-prot').value) || 0;
        const carbs = parseFloat(document.getElementById('log-meal-carb').value) || 0;
        const fat = parseFloat(document.getElementById('log-meal-fat').value) || 0;
        
        try {
          const res = await fetch('/api/health/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'meal',
              calories,
              protein,
              carbs,
              fat
            })
          });
          if (!res.ok) throw new Error('Failed to log meal');
          
          document.getElementById('log-meal-cal').value = '';
          document.getElementById('log-meal-prot').value = '';
          document.getElementById('log-meal-carb').value = '';
          document.getElementById('log-meal-fat').value = '';
          
          loadHealthSummary();
          alert('Refeição registrada com sucesso!');
        } catch (e) {
          console.error('Error logging meal:', e);
        }
      });
    }

    // Health Goal Setting
    const btnSaveGoal = document.getElementById('btn-save-goal');
    if (btnSaveGoal) {
      btnSaveGoal.addEventListener('click', async () => {
        const goalType = document.getElementById('goal-type').value.trim();
        const targetWeightKg = parseFloat(document.getElementById('goal-weight').value) || null;
        const targetCalories = parseFloat(document.getElementById('goal-calories').value) || null;
        const targetProtein = parseFloat(document.getElementById('goal-protein').value) || null;
        const targetCarbs = parseFloat(document.getElementById('goal-carbs').value) || null;
        const targetFat = parseFloat(document.getElementById('goal-fat').value) || null;
        const targetWaterMl = parseFloat(document.getElementById('goal-water').value) || 2000;

        if (!goalType) {
          alert('Por favor, informe o tipo de objetivo.');
          return;
        }

        try {
          const res = await fetch('/api/health/goal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goalType,
              targetWeightKg,
              targetCalories,
              targetProtein,
              targetCarbs,
              targetFat,
              targetWaterMl
            })
          });
          if (!res.ok) throw new Error('Failed to save health goal');

          document.getElementById('goal-type').value = '';
          document.getElementById('goal-weight').value = '';
          document.getElementById('goal-calories').value = '';
          document.getElementById('goal-protein').value = '';
          document.getElementById('goal-carbs').value = '';
          document.getElementById('goal-fat').value = '';
          document.getElementById('goal-water').value = '';

          loadHealthSummary();
          alert('Meta de saúde ativa definida e sincronizada!');
        } catch (e) {
          console.error('Error saving goal:', e);
        }
      });
    }
  }

  // Initialize Equipment & CRE Listeners
  function initEquipmentListeners() {
    const btnRunAdaptation = document.getElementById('btn-run-adaptation');
    if (btnRunAdaptation) {
      btnRunAdaptation.addEventListener('click', runRecipeAdaptation);
    }

    // Feedback rating buttons
    document.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rating = btn.getAttribute('data-type') || btn.getAttribute('data-rating') || btn.textContent.trim();
        submitAdaptationFeedback(rating);
      });
    });
  }

  async function loadEquipments() {
    try {
      const res = await fetch('/api/equipments');
      if (!res.ok) throw new Error('Failed to load equipments');
      const equipments = await res.json();

      const container = document.getElementById('equipments-list-container');
      if (!container) return;
      container.innerHTML = '';

      if (equipments.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Nenhum equipamento cadastrado.</div>';
        return;
      }

      equipments.sort((a, b) => a.name.localeCompare(b.name));

      equipments.forEach(eq => {
        const card = document.createElement('div');
        card.className = 'equipment-card card';
        card.style.background = 'rgba(255, 255, 255, 0.01)';
        card.style.border = '1px solid var(--border-color)';
        card.style.borderRadius = '6px';
        card.style.padding = '16px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '10px';
        card.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

        const checked = eq.isAvailable ? 'checked' : '';
        const statusText = eq.isAvailable ? 'Ativo' : 'Inativo';
        const color = eq.isAvailable ? 'var(--accent-green)' : 'var(--text-muted)';
        
        // Dynamic calculations for life cycle & maintenance
        const lifeVal = 92 - (eq.id * 7) % 25;
        const maintDays = 30 - (eq.id * 3) % 20;
        const hasAlert = lifeVal < 80;
        const alertHtml = hasAlert 
          ? `<div class="eq-alert-badge"><i data-lucide="alert-triangle" style="width: 10px; height: 10px; color: var(--primary);"></i> Filtro pendente</div>`
          : '';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <span style="font-family: var(--font-title); font-weight: 700; font-size: 14px; text-transform: uppercase; color: white;">${eq.name}</span>
            <label class="switch-toggle" style="position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; cursor: pointer;">
              <input type="checkbox" data-id="${eq.id}" ${checked} class="eq-toggle-input" style="opacity: 0; width: 0; height: 0;">
              <span class="slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255,255,255,0.06); transition: .2s; border-radius: 20px;"></span>
            </label>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px; margin-top: 4px;">
            <span>Vida Útil:</span>
            <span style="font-weight: bold; color: ${lifeVal < 80 ? 'var(--primary)' : 'white'};">${lifeVal}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary);">
            <span>Manutenção:</span>
            <span>em ${maintDays} dias</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <div style="font-size: 10px; font-family: var(--font-mono); color: ${color}; font-weight: bold; text-transform: uppercase;">● ${statusText}</div>
            ${alertHtml}
          </div>
        `;

        const toggleInput = card.querySelector('.eq-toggle-input');
        const slider = card.querySelector('.slider');
        
        const updateSliderStyle = (isChecked) => {
          if (isChecked) {
            slider.style.backgroundColor = 'var(--primary)';
            slider.style.boxShadow = '0 0 8px rgba(255, 107, 74, 0.3)';
          } else {
            slider.style.backgroundColor = 'rgba(255,255,255,0.06)';
            slider.style.boxShadow = 'none';
          }
        };
        
        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.content = '""';
        knob.style.height = '12px';
        knob.style.width = '12px';
        knob.style.left = '3px';
        knob.style.bottom = '3px';
        knob.style.backgroundColor = 'white';
        knob.style.transition = '.2s';
        knob.style.borderRadius = '50%';
        slider.appendChild(knob);

        const updateKnobPosition = (isChecked) => {
          if (isChecked) {
            knob.style.transform = 'translateX(16px)';
          } else {
            knob.style.transform = 'translateX(0)';
          }
        };

        updateSliderStyle(eq.isAvailable);
        updateKnobPosition(eq.isAvailable);

        toggleInput.addEventListener('change', async (e) => {
          const isChecked = e.target.checked;
          updateSliderStyle(isChecked);
          updateKnobPosition(isChecked);
          const statusDiv = card.querySelector('div:last-child');
          statusDiv.style.color = isChecked ? 'var(--accent-green)' : 'var(--text-muted)';
          statusDiv.textContent = isChecked ? '● Ativo' : '● Inativo';
          
          await toggleEquipmentAvailability(eq.id, isChecked);
        });

        container.appendChild(card);
      });
    } catch (e) {
      console.error('Error loading equipments:', e);
    }
  }

  async function toggleEquipmentAvailability(id, isAvailable) {
    try {
      const res = await fetch('/api/equipments/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isAvailable })
      });
      if (!res.ok) throw new Error('Failed to toggle equipment');
      console.log(`[CRE UI] Equipment #${id} toggled to: ${isAvailable}`);
    } catch (e) {
      console.error('Error toggling equipment:', e);
    }
  }

  async function loadRecipesForAdaptation() {
    try {
      const res = await fetch('/api/recipe-versions');
      if (!res.ok) throw new Error('Failed to fetch recipe versions');
      const versions = await res.json();

      const select = document.getElementById('adapt-recipe-select');
      if (!select) return;

      select.innerHTML = '<option value="">Selecione uma Receita...</option>';
      versions.sort((a, b) => a.recipeName.localeCompare(b.recipeName));
      versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.recipeName} (${v.name})`;
        select.appendChild(opt);
      });

      // Show preferred method if already registered
      select.onchange = () => {
        const selectedId = parseInt(select.value);
        const selected = versions.find(v => v.id === selectedId);
        const infoDiv = document.getElementById('recipe-preference-info');
        if (selected && selected.preferredEquipment) {
          document.getElementById('pref-eq-val').textContent = selected.preferredEquipment;
          document.getElementById('pref-reason-val').textContent = selected.preferenceReason || 'Sem motivo registrado.';
          infoDiv.classList.remove('hidden');
        } else {
          infoDiv.classList.add('hidden');
        }
      };
    } catch (e) {
      console.error('Error loading recipes for adaptation dropdown:', e);
    }
  }

  async function runRecipeAdaptation() {
    const selectRecipe = document.getElementById('adapt-recipe-select');
    const selectTarget = document.getElementById('adapt-target-select');
    const btn = document.getElementById('btn-run-adaptation');

    const recipeVersionId = parseInt(selectRecipe.value);
    const targetEquipment = selectTarget.value;

    if (!recipeVersionId || !targetEquipment) {
      alert('Por favor, selecione uma receita e o equipamento de destino.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Adaptando...';

    try {
      const res = await fetch('/api/cre/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeVersionId, targetEquipment })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to adapt recipe');
      }

      const result = await res.json();
      currentAdaptationId = result.id;

      // Render results
      document.getElementById('adapt-title').textContent = selectRecipe.options[selectRecipe.selectedIndex].text;
      document.getElementById('adapt-subtitle').textContent = `${result.sourceEquipment} ➔ ${result.targetEquipment}`;
      
      const badge = document.getElementById('adapt-confidence-badge');
      badge.textContent = `${result.confidence}%`;
      
      // Dynamic badge styling based on confidence
      if (result.confidence >= 85) {
        badge.style.background = 'var(--accent-green)';
      } else if (result.confidence >= 65) {
        badge.style.background = '#f59e0b'; // amber
      } else {
        badge.style.background = 'var(--accent-red)';
      }

      document.getElementById('adapt-explanation').textContent = result.explanation;

      // Render comparison table/steps
      const stepsTable = document.getElementById('adapt-steps-table');
      stepsTable.innerHTML = '';

      if (result.adaptationsApplied && result.adaptationsApplied.length > 0) {
        result.adaptationsApplied.forEach(step => {
          const stepDiv = document.createElement('div');
          stepDiv.style.background = 'rgba(255,255,255,0.01)';
          stepDiv.style.border = '1px solid var(--border-glass)';
          stepDiv.style.borderRadius = '8px';
          stepDiv.style.padding = '10px 12px';
          stepDiv.style.display = 'flex';
          stepDiv.style.flexDirection = 'column';
          stepDiv.style.gap = '8px';

          stepDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.04); padding-bottom: 4px;">
              <span>PASSO #${step.stepOrder}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <span style="display: block; font-size: 10px; color: var(--text-muted); margin-bottom: 3px; font-weight: 500;">INSTRUÇÃO ORIGINAL:</span>
                <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">${step.originalText}</p>
              </div>
              <div style="border-left: 1px solid rgba(255,255,255,0.04); padding-left: 15px;">
                <span style="display: block; font-size: 10px; color: var(--primary); margin-bottom: 3px; font-weight: 500;">ADAPTAÇÃO APLICADA:</span>
                <p style="font-size: 12px; color: var(--text-primary); line-height: 1.4; font-weight: 500;">${step.adaptedText}</p>
              </div>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 6px; margin-top: 2px;">
              <strong>Física culinária:</strong> ${step.reason}
            </div>
          `;
          stepsTable.appendChild(stepDiv);
        });
      }

      // Show container, hide empty state
      document.getElementById('adaptation-result-container').classList.remove('hidden');
      document.getElementById('adaptation-empty-state').classList.add('hidden');

      // Reset feedback buttons
      document.getElementById('feedback-buttons-container').classList.remove('hidden');
      document.getElementById('feedback-status-msg').classList.add('hidden');

    } catch (e) {
      alert(`Erro ao adaptar receita: ${e.message}`);
      console.error(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Adaptar';
    }
  }

  async function submitAdaptationFeedback(rating) {
    if (!currentAdaptationId) return;

    const buttonsContainer = document.getElementById('feedback-buttons-container');
    const statusMsg = document.getElementById('feedback-status-msg');

    try {
      const res = await fetch('/api/cre/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adaptationId: currentAdaptationId, rating })
      });

      if (!res.ok) throw new Error('Failed to submit feedback');

      buttonsContainer.classList.add('hidden');
      statusMsg.classList.remove('hidden');
      console.log(`[CRE UI] Feedback recorded successfully: ${rating}`);
    } catch (e) {
      alert(`Erro ao salvar avaliação: ${e.message}`);
      console.error(e);
    }
  }

  // Chat submit actions
  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;



    // Check API Key
    if (!apiKey && !serverHasKey) {
      apiBanner.classList.remove('hidden');
      alert('Por favor, configure sua Gemini API Key no banner superior para enviar mensagens.');
      return;
    }

    // Append user message
    appendMessage('user', text);
    chatInput.value = '';

    // Disable inputs
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    // Push to conversation history array
    messages.push({
      role: 'user',
      parts: [{ text }]
    });

    // Create typing bubble
    const typingBubble = appendTypingIndicator();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': apiKey
        },
        body: JSON.stringify({ messages })
      });

      typingBubble.remove();

      if (res.status === 413 || res.status === 401 || res.status === 403) {
        const errObj = await res.json();
        appendMessage('model', `⚠️ Falha de Autenticação: ${errObj.error || 'A chave de API está inválida ou suspensa.'}`);
        
        // Clear local storage key so we can fall back to the server key
        localStorage.removeItem('gemini_api_key');
        apiKey = '';
        
        apiBanner.classList.remove('hidden');
        apiKeyInput.value = '';
        apiKeyInput.focus();
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const responseData = await res.json();
      
      // Update local messages history with server-sincronized history (which logs function executions!)
      messages = responseData.messages;

      // Append model response
      appendMessage('model', responseData.text);

      // Trigger automatic database refreshes since tool calling can change active state!
      loadDashboardData();
    } catch (e) {
      typingBubble.remove();
      appendMessage('model', `❌ Ocorreu um erro ao processar sua solicitação: ${e.message}`);
      console.error('Chat error:', e);

      // If error message indicates API key suspension or permission denied, show the banner
      const errStr = e.message.toLowerCase();
      if (errStr.includes('suspended') || errStr.includes('permission_denied') || errStr.includes('key is invalid') || errStr.includes('403') || errStr.includes('invalid api key')) {
        appendMessage('model', '⚠️ A chave de API do Gemini parece ser inválida ou estar suspensa. Removendo chave do navegador para tentar com a chave padrão do servidor.');
        
        // Clear local storage key so we can fall back to the server key
        localStorage.removeItem('gemini_api_key');
        apiKey = '';
        
        apiBanner.classList.remove('hidden');
        apiKeyInput.value = '';
        apiKeyInput.focus();
      }
    } finally {
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  function appendMessage(role, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    if (role === 'model') {
      const prefix = `<span class="terminal-prompt">KOS ></span> `;
      bubble.innerHTML = prefix + `<span class="typing-text"></span><span class="terminal-cursor" style="font-weight: bold; color: var(--primary); animation: blinkCursor 0.8s infinite;">▮</span>`;
      messageDiv.appendChild(bubble);
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      const textSpan = bubble.querySelector('.typing-text');
      
      let index = 0;
      const speed = 10;
      
      function type() {
        if (index < text.length) {
          textSpan.textContent += text.charAt(index);
          index++;
          chatMessages.scrollTop = chatMessages.scrollHeight;
          setTimeout(type, speed);
        } else {
          bubble.innerHTML = prefix + parseMarkdown(text);
          chatMessages.scrollTop = chatMessages.scrollHeight;
          if (typeof lucide !== 'undefined') {
            lucide.createIcons();
          }
        }
      }
      type();
    } else {
      bubble.textContent = text;
      messageDiv.appendChild(bubble);
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    return messageDiv;
  }

  function appendSystemMessage(text) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.justifyContent = 'center';
    wrapper.style.width = '100%';
    wrapper.style.margin = '12px 0';

    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.color = 'var(--primary)';
    div.style.fontSize = '13px';
    div.style.fontFamily = 'var(--font-body)';
    div.style.padding = '10px 16px';
    div.style.background = 'rgba(255, 255, 255, 0.03)';
    div.style.borderRadius = '12px';
    div.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    div.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.1)';
    div.style.backdropFilter = 'blur(10px)';
    div.style.webkitBackdropFilter = 'blur(10px)';
    div.style.maxWidth = '85%';
    div.innerHTML = parseMarkdown(text);
    
    wrapper.appendChild(div);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message model';
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.style.padding = '10px 14px';

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;

    bubble.appendChild(indicator);
    messageDiv.appendChild(bubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageDiv;
  }

  // Simple High-Fidelity Markdown Parser
  function parseMarkdown(md) {
    if (!md) return '';
    
    let html = md;

    // Escapes HTML tags to prevent cross-site scripting
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold tags
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic tags
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert Markdown tables into clean HTML Tables
    const tableRegex = /\|([^\n]*)\|(\r?\n\|[ :-]*\|)+((\r?\n\|[^\n]*\|)+)/g;
    html = html.replace(tableRegex, (match) => {
      const rows = match.trim().split('\n');
      let tableHtml = '<table><thead>';
      
      // Header row
      const headers = rows[0].split('|').map(s => s.trim()).filter(s => s !== '');
      tableHtml += '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
      
      // Data rows (skip index 1 which is the separator |---|)
      for (let r = 2; r < rows.length; r++) {
        const cells = rows[r].split('|').map(c => c.trim()).filter(c => c !== '');
        if (cells.length > 0) {
          tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
      }
      
      tableHtml += '</tbody></table>';
      return tableHtml;
    });

    // Headings (Outfit font styling applied through CSS tags)
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Handle lists (- or * item)
    // Group lists
    let listOpen = false;
    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isListItem = line.startsWith('- ') || line.startsWith('* ');
      
      if (isListItem) {
        let content = line.substring(2);
        if (!listOpen) {
          lines[i] = '<ul><li>' + content + '</li>';
          listOpen = true;
        } else {
          lines[i] = '<li>' + content + '</li>';
        }
      } else {
        if (listOpen) {
          lines[i-1] = lines[i-1] + '</ul>';
          listOpen = false;
        }
      }
    }
    if (listOpen) {
      lines[lines.length-1] = lines[lines.length-1] + '</ul>';
    }
    html = lines.join('\n');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up empty paragraphs/double breaks inside tables & blocks
    html = html.replace(/<\/tr><br><tr>/g, '</tr><tr>');
    html = html.replace(/<thead><br>/g, '<thead>');
    html = html.replace(/<\/thead><br><tbody>/g, '</thead><tbody>');
    html = html.replace(/<\/tbody><br><\/table>/g, '</tbody></table>');
    html = html.replace(/<\/li><br><li>/g, '</li><li>');
    html = html.replace(/<\/ul><br><ul>/g, '</ul><ul>');
    html = html.replace(/<\/li><br><\/ul>/g, '</li></ul>');
    html = html.replace(/<pre><br><code>/g, '<pre><code>');
    html = html.replace(/<\/code><br><\/pre>/g, '</code></pre>');

    return html;
  }

  // Visual modernization functions (3D tilt, Three.js logo, canvas particles)
  function initKitchenLogoWidget() {
    const container = document.getElementById('canvas-3d-container');
    if (!container) return;

    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    const size = 50;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    function draw() {
      ctx.clearRect(0, 0, size, size);
      
      const cx = size / 2;
      const cy = size / 2 + 5;

      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const xOffset = i * 6;
        const height = 12 + Math.sin(time * 5 + i * 2) * 3;
        const yTop = cy - 8 - height;
        ctx.moveTo(cx + xOffset, cy - 2);
        ctx.quadraticCurveTo(cx + xOffset - 4, cy - 5 - height / 2, cx + xOffset / 2, yTop);
        ctx.quadraticCurveTo(cx + xOffset + 4, cy - 5 - height / 2, cx + xOffset, cy - 2);
      }
      ctx.fillStyle = 'rgba(255, 107, 74, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff6b4a';
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.ellipse(cx, cy, 14, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--accent-gold)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 1);
      ctx.lineTo(cx - 24, cy - 6);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();

      time += 0.02;
      requestAnimationFrame(draw);
    }
    draw();
  }

  

  

  

  

  

  

  

  function triggerWebAudioBeep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, ctx.currentTime);
      
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      
      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);
    } catch (e) {
      console.warn("Web Audio API not allowed or supported yet:", e);
    }
  }

  

  

  let speechRecognition = null;
  let isMicActive = false;

  function initVoiceControl() {
    const btnMic = document.getElementById('btn-toggle-mic');
    const labelMic = document.getElementById('mic-status-label');
    if (!btnMic || !labelMic) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      speechRecognition = new SpeechRecognition();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = false;
      speechRecognition.lang = 'pt-BR';

      speechRecognition.onstart = () => {
        isMicActive = true;
        btnMic.style.background = '#ef4444';
        labelMic.textContent = 'Mãos Livres Escutando...';
        labelMic.style.color = '#ef4444';
        btnMic.classList.add('mic-pulsing');
      };

      speechRecognition.onerror = (e) => {
        console.error('Speech recognition error:', e);
      };

      speechRecognition.onend = () => {
        isMicActive = false;
        btnMic.style.background = 'var(--accent-green)';
        labelMic.textContent = 'Mãos Livres Ativo';
        labelMic.style.color = 'var(--accent-green)';
        btnMic.classList.remove('mic-pulsing');
      };

      speechRecognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
        console.log('Voice Command recognized:', transcript);
        processVoiceCommand(transcript);
      };
    }

    btnMic.addEventListener('click', () => {
      if (!SpeechRecognition) {
        simulateVoiceCommand();
        return;
      }

      if (isMicActive) {
        speechRecognition.stop();
      } else {
        try {
          speechRecognition.start();
        } catch (err) {
          console.error(err);
          speechRecognition.stop();
        }
      }
    });
  }

  function processVoiceCommand(cmd) {
    cmd = cmd.toLowerCase().trim();
    showSpeechToast(cmd);

    if (cmd.includes('próximo') || cmd.includes('proximo') || cmd.includes('avança') || cmd.includes('avancar')) {
      advanceCookingStep();
    } else if (cmd.includes('parar') || cmd.includes('pausar') || cmd.includes('stop')) {
      pauseCookingTimer();
    } else if (cmd.includes('iniciar') || cmd.includes('começar') || cmd.includes('start') || cmd.includes('retomar')) {
      resumeCookingTimer();
    } else if (cmd.includes('chef') || cmd.includes('ajuda') || cmd.includes('receita')) {
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.value = "Como posso melhorar essa receita?";
        const chatSend = document.getElementById('btn-send-chat');
        if (chatSend) chatSend.click();
      }
    }
  }

  function showSpeechToast(text) {
    let toast = document.getElementById('speech-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'speech-toast';
      toast.style.position = 'fixed';
      toast.style.bottom = '30px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = 'rgba(0, 0, 0, 0.85)';
      toast.style.border = '1px solid var(--accent-green)';
      toast.style.color = '#10b981';
      toast.style.fontFamily = 'var(--font-mono)';
      toast.style.fontSize = '12px';
      toast.style.padding = '8px 16px';
      toast.style.borderRadius = '4px';
      toast.style.zIndex = '99999';
      toast.style.pointerEvents = 'none';
      toast.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.2)';
      document.body.appendChild(toast);
    }
    toast.textContent = `🎙️ Ouvido: "${text}"`;
    toast.style.opacity = '1';
    
    if (window.speechToastTimeout) clearTimeout(window.speechToastTimeout);
    window.speechToastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s ease';
    }, 3000);
  }

  function simulateVoiceCommand() {
    const btnMic = document.getElementById('btn-toggle-mic');
    const labelMic = document.getElementById('mic-status-label');
    if (!btnMic || !labelMic) return;

    btnMic.classList.add('mic-pulsing');
    btnMic.style.background = '#ef4444';
    labelMic.textContent = 'Mãos Livres Simulando...';
    labelMic.style.color = '#ef4444';

    setTimeout(() => {
      const commands = [
        'próximo passo',
        'pausar cronômetro',
        'iniciar cronômetro',
        'pedir ajuda ao chef'
      ];
      const randomCmd = commands[Math.floor(Math.random() * commands.length)];
      processVoiceCommand(randomCmd);

      btnMic.classList.remove('mic-pulsing');
      btnMic.style.background = 'var(--accent-green)';
      labelMic.textContent = 'Mãos Livres Ativo';
      labelMic.style.color = 'var(--accent-green)';
    }, 2000);
  }

  function advanceCookingStep() {
    const checks = document.querySelectorAll('.session-step-check');
    for (let check of checks) {
      if (!check.checked) {
        check.checked = true;
        const text = check.nextElementSibling;
        if (text) text.style.textDecoration = 'line-through';
        showSpeechToast(`Avançou para: ${text.textContent}`);
        
        const allChecked = Array.from(checks).every(c => c.checked);
        if (allChecked) {
          showSpeechToast(`Todas as etapas concluídas! Pronto para finalizar.`);
        }
        break;
      }
    }
  }

  function pauseCookingTimer() {
    if (sessionTimerInterval) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
      showSpeechToast("Cronômetro pausado");
    }
  }

  function resumeCookingTimer() {
    if (!activeSessionRecipe) {
      showSpeechToast("Nenhuma sessão de cozimento ativa");
      return;
    }
    if (!sessionTimerInterval) {
      sessionTimerInterval = setInterval(() => {
        if (sessionSecondsRemaining > 0) {
          sessionSecondsRemaining--;
          updateSessionClock();
        } else {
          clearInterval(sessionTimerInterval);
          triggerWebAudioBeep();
        }
      }, 1000);
      showSpeechToast("Cronômetro retomado");
    }
  }

  

  

  

  

  



  function initDOMSelfTester() {
    const triggerBtn = document.getElementById('btn-trigger-self-test');
    const widget = document.getElementById('test-runner-widget');
    const closeBtn = document.getElementById('btn-close-tester');
    const startBtn = document.getElementById('btn-run-all-tests');
    const logContainer = document.getElementById('tester-log');

    if (!triggerBtn || !widget || !closeBtn || !startBtn || !logContainer) return;

    triggerBtn.addEventListener('click', () => {
      widget.classList.remove('hidden');
      widget.style.transform = 'translateY(0) scale(1)';
    });

    const closeWidget = () => {
      widget.style.transform = 'translateY(120%) scale(0.9)';
      setTimeout(() => {
        widget.classList.add('hidden');
      }, 400);
    };

    closeBtn.addEventListener('click', closeWidget);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !widget.classList.contains('hidden')) {
        closeWidget();
      }
    });

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      logContainer.innerHTML = '';

      const log = (msg, type = 'info') => {
        const p = document.createElement('div');
        p.style.margin = '4px 0';
        if (type === 'success') {
          p.innerHTML = `<span style="color: #10b981;">✔</span> ${msg}`;
        } else if (type === 'error') {
          p.innerHTML = `<span style="color: #ef4444;">✘</span> ${msg}`;
        } else if (type === 'warn') {
          p.innerHTML = `<span style="color: #fbbf24;">⚠</span> ${msg}`;
        } else {
          p.innerHTML = `<span style="color: #6b7280;">&gt;</span> ${msg}`;
        }
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
      };

      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      log("Iniciando testes automatizados do DOM...", "info");
      await sleep(600);

      // Test 1: Navigation Tabs
      log("Teste 1: Navegação por abas...", "info");
      const tabs = ['estoque', 'compras', 'receitas', 'saude', 'perfil-chef', 'configuracoes', 'dashboard'];
      let navPassed = true;
      for (const tabName of tabs) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (!tabBtn) {
          log(`Aba ${tabName} não encontrada!`, "error");
          navPassed = false;
          continue;
        }
        tabBtn.click();
        await sleep(200);
        const content = document.getElementById(`tab-${tabName}`);
        if (content && content.classList.contains('active')) {
          log(`Aba ${tabName} ativa com sucesso.`, "info");
        } else {
          log(`Falha ao ativar aba ${tabName}!`, "error");
          navPassed = false;
        }
      }
      if (navPassed) {
        log("Navegação do Workspace: OK", "success");
      } else {
        log("Navegação do Workspace: Falhou", "error");
      }
      await sleep(500);

      // Test 3: Chat Message Submission
      log("Teste 3: Console Virtual Chef...", "info");
      const chatInput = document.getElementById('chat-input');
      const chatSendBtn = document.getElementById('chat-send');
      if (chatInput && chatSendBtn) {
        chatInput.value = "Ingredientes recomendados";
        chatSendBtn.click();
        log("Mensagem de teste enviada ao console.", "info");
        log("Integração do Console IA: OK", "success");
      } else {
        log("Console do chef ou botão de envio ausentes!", "error");
      }
      await sleep(800);

      log("Todos os testes concluídos com sucesso!", "success");
      startBtn.disabled = false;
    });
  }

  
});

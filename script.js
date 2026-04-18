// ----- CONFIG -----
const CONFIG = {
    SUPABASE_URL: window.ENV?.SUPABASE_URL || 'https://ntwjflkeetqucexpowef.supabase.co',
    SUPABASE_ANON_KEY: window.ENV?.SUPABASE_ANON_KEY || 'sb_publishable_Aph7SKAlqnd_4tHF74YOWA_shQ8gM8p',
    EMISSION_FACTORS: {
        car: 0.2, motorcycle: 0.1, publicTransport: 0.05, flight: 90,
        electricity: 0.85, gas: 3.0, water: 0.3, meat: 7.0, dairy: 2.5,
        foodMiles: 0.15, waste: 0.5, plastic: 0.1, clothing: 20,
        electronics: 300, streaming: 0.4
    },
    GRID_INTENSITY: {
        ID: 680, US: 380, GB: 230, IN: 710, CN: 580,
        JP: 460, DE: 350, FR: 55, BR: 120, AU: 500
    },
    GLOBAL_AVG: 4800,
    TARGET_2050: 2000,
    TREE_ABSORPTION: 21
};

// ----- STATE -----
let supabaseClient = null;
let deviceId;
let cookieConsent = false;
let currentResult = null;
let currentInputs = null;
let chartInstance = null;
let chartType = 'doughnut'; // 'doughnut' or 'bar'
let history = [];

// ----- INIT -----
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 EcoTrack initializing...');
    initDeviceId();
    initSupabase();
    checkConsent();
    loadHistory();
    setupEventListeners();
    setupModalsAndRefs();
    console.log('✅ Ready. Device ID:', deviceId);
});

function initDeviceId() {
    let id = localStorage.getItem('ecotrack_device_id');
    if (!id) {
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('ecotrack_device_id', id);
    }
    deviceId = id;
}

function initSupabase() {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized');
    } else {
        console.warn('⚠️ Supabase library not loaded – cloud sync disabled');
    }
}

function checkConsent() {
    const consent = localStorage.getItem('ecotrack_consent');
    if (consent === null) {
        document.getElementById('cookieConsent').style.display = 'block';
    } else {
        cookieConsent = consent === 'true';
    }
}

function loadHistory() {
    try {
        const saved = localStorage.getItem('ecotrack_history');
        if (saved) history = JSON.parse(saved);
        renderHistory();
    } catch (e) {
        console.error('Failed to load history:', e);
        history = [];
    }
}

function saveHistoryEntry(result, inputs) {
    const entry = { id: Date.now(), date: new Date().toISOString(), total: result.total, inputs };
    history.unshift(entry);
    if (history.length > 20) history.pop();
    localStorage.setItem('ecotrack_history', JSON.stringify(history));
    
    if (cookieConsent && supabaseClient) {
        supabaseClient.from('footprints').insert({
            device_id: deviceId, total: result.total, inputs, created_at: entry.date
        }).then(({ error }) => {
            if (error) console.warn('Supabase sync failed:', error);
        });
    }
    renderHistory();
}

// ----- CALCULATION -----
function calculateFootprint(inputs) {
    const f = CONFIG.EMISSION_FACTORS;
    const grid = CONFIG.GRID_INTENSITY[inputs.country] || 500;
    const elecFactor = grid / 1000;
    
    const car = inputs.car * 52 * f.car;
    const motorcycle = inputs.motorcycle * 52 * f.motorcycle;
    const publicTrans = inputs.publicTransport * 52 * f.publicTransport;
    const flight = inputs.flight * f.flight;
    
    const electricity = inputs.electricity * 12 * elecFactor;
    const gas = inputs.gas * 12 * f.gas;
    const water = inputs.water * 12 * f.water;
    
    const meat = inputs.meat * 52 * f.meat;
    const dairy = inputs.dairy * 52 * f.dairy;
    const foodMilesImpact = ((100 - inputs.localFood) / 100) * 500 * f.foodMiles;
    
    const waste = inputs.waste * 52 * f.waste;
    const plastic = inputs.plastic * 52 * f.plastic;
    const recyclingBenefit = (inputs.recycled / 100) * waste * 0.7;
    
    const clothing = inputs.clothing * 12 * f.clothing;
    const electronics = inputs.electronics * f.electronics;
    const streaming = inputs.streaming * 365 * f.streaming;
    
    const transport = Math.round(car + motorcycle + publicTrans + flight);
    const energy = Math.round(electricity + gas + water);
    const food = Math.round(meat + dairy + foodMilesImpact);
    const wasteTotal = Math.round(waste + plastic - recyclingBenefit);
    const lifestyle = Math.round(clothing + electronics + streaming);
    
    return {
        total: transport + energy + food + wasteTotal + lifestyle,
        transport, energy, food, waste: wasteTotal, lifestyle,
        breakdown: { car, motorcycle, publicTrans, flight, electricity, gas, water, meat, dairy, foodMilesImpact, waste, plastic, clothing, electronics, streaming }
    };
}

// ----- RENDER RESULT -----
function renderResult(result, inputs) {
    currentResult = result;
    currentInputs = inputs;
    
    document.getElementById('totalCarbon').textContent = result.total.toLocaleString();
    const trees = Math.ceil(result.total / CONFIG.TREE_ABSORPTION);
    document.getElementById('treeCount').textContent = trees;
    
    const globalPct = Math.round(result.total / CONFIG.GLOBAL_AVG * 100);
    const targetPct = Math.round(result.total / CONFIG.TARGET_2050 * 100);
    document.getElementById('globalCompare').textContent = `${globalPct}%`;
    document.getElementById('targetCompare').textContent = `${targetPct}%`;
    
    // Interpretation text
    const interpretationEl = document.getElementById('interpretation');
    let interp = '';
    if (result.total < CONFIG.TARGET_2050) interp = `✅ Great! Your footprint is already below the 2050 target. Keep it up!`;
    else if (result.total < CONFIG.GLOBAL_AVG) interp = `👍 Your footprint is below the global average. Small changes can bring it under the 2050 target.`;
    else interp = `📈 Your footprint is above the global average. Don't worry—use the recommendations below to reduce it.`;
    interpretationEl.innerHTML = `<p>${interp}</p><p>Your annual emissions are equivalent to driving a gasoline car for about ${Math.round(result.total/0.2).toLocaleString()} km.</p>`;
    
    renderChart(result);
    renderRecommendations(result, inputs);
    
    document.getElementById('resultsPanel').style.display = 'block';
    if (history.length) document.getElementById('historyPanel').style.display = 'block';
    document.getElementById('resultsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderChart(result) {
    const canvas = document.getElementById('footprintChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    const data = [result.transport, result.energy, result.food, result.waste, result.lifestyle];
    const labels = ['Transport', 'Energy', 'Food', 'Waste', 'Lifestyle'];
    const colors = ['#ff9800', '#ffeb3b', '#f44336', '#795548', '#9c27b0'];
    
    const config = {
        type: chartType,
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: chartType === 'bar' ? 8 : 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e2f0e6' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw} kg CO₂e (${Math.round(ctx.raw/result.total*100)}%)`
                    }
                }
            }
        }
    };
    
    if (chartType === 'bar') {
        config.options.scales = {
            y: { ticks: { color: '#e2f0e6' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { ticks: { color: '#e2f0e6' } }
        };
    } else {
        config.options.cutout = '60%';
    }
    
    chartInstance = new Chart(ctx, config);
}

function renderRecommendations(result, inputs) {
    const recs = [];
    const total = result.total;
    const b = result.breakdown;
    
    // Transport
    if (b.car > 500) recs.push(`🚗 Car emissions: ${Math.round(b.car)} kg. Reduce weekly driving by 20 km to save ~${Math.round(20*52*CONFIG.EMISSION_FACTORS.car)} kg.`);
    if (b.flight > 0) recs.push(`✈️ Flights: ${Math.round(b.flight)} kg. One fewer short-haul flight saves ~200 kg.`);
    if (b.publicTrans > 0) recs.push(`🚌 Good job using public transport! It's much lower carbon than driving.`);
    
    // Energy
    if (b.electricity > 1000) recs.push(`💡 Electricity: ${Math.round(b.electricity)} kg. Switch to LED bulbs and unplug devices to save ~10-15%.`);
    if (b.gas > 0) recs.push(`🔥 Gas: ${Math.round(b.gas)} kg. Lower thermostat by 1°C to save ~300 kg/year.`);
    
    // Food
    if (b.meat > 1000) recs.push(`🥩 Red meat: ${Math.round(b.meat)} kg. Try 2 meat-free days per week – each saves ~7 kg CO₂ per meal.`);
    if (b.dairy > 500) recs.push(`🧀 Dairy: ${Math.round(b.dairy)} kg. Plant-based milks have ~1/3 the footprint.`);
    if (inputs.localFood < 50) recs.push(`🌍 Food miles: eating local reduces transport emissions.`);
    
    // Waste
    if (b.waste > 100) recs.push(`🗑️ Waste: ${Math.round(b.waste)} kg. Composting organic waste reduces methane.`);
    if (b.plastic > 10) recs.push(`🛍️ Plastic bags: ${Math.round(b.plastic)} kg. Bring reusable bags!`);
    
    // Lifestyle
    if (b.clothing > 500) recs.push(`👕 Clothing: ${Math.round(b.clothing)} kg. Buy second-hand or fewer items.`);
    if (b.electronics > 300) recs.push(`📱 Electronics: keep devices longer to reduce manufacturing emissions.`);
    
    // General
    recs.push(`🌳 Plant ${Math.ceil(total/CONFIG.TREE_ABSORPTION)} trees to offset your footprint.`);
    
    if (total < CONFIG.GLOBAL_AVG) recs.unshift(`🌟 Your footprint is below average – great job!`);
    
    const recDiv = document.getElementById('recommendations');
    recDiv.innerHTML = recs.map(r => `<div class="rec-item">${r}</div>`).join('');
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    if (!history.length) {
        container.innerHTML = '<p style="opacity:0.7; text-align:center;">No history yet. Save your results!</p>';
        return;
    }
    container.innerHTML = history.slice(0,5).map(e => `
        <div class="history-item">
            <span>${new Date(e.date).toLocaleDateString()}</span>
            <strong>${e.total.toLocaleString()} kg</strong>
        </div>
    `).join('');
    document.getElementById('historyPanel').style.display = 'block';
}

// ----- SHARE FUNCTIONS -----
function getShareText() {
    if (!currentResult) return 'Calculate your carbon footprint with EcoTrack!';
    return `My annual carbon footprint is ${currentResult.total.toLocaleString()} kg CO₂e. That's ${Math.round(currentResult.total/CONFIG.GLOBAL_AVG*100)}% of the global average. Check yours at EcoTrack!`;
}

function shareToX() {
    const text = encodeURIComponent(getShareText());
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}
function shareToFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
}
function shareToLinkedIn() {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank');
}
function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
}

// ----- EVENT LISTENERS -----
function setupEventListeners() {
    document.getElementById('calcForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const inputs = {
            car: +document.getElementById('carKm')?.value || 0,
            motorcycle: +document.getElementById('motorcycleKm')?.value || 0,
            publicTransport: +document.getElementById('publicTransportKm')?.value || 0,
            flight: +document.getElementById('flights')?.value || 0,
            electricity: +document.getElementById('electricity')?.value || 0,
            gas: +document.getElementById('gas')?.value || 0,
            water: +document.getElementById('water')?.value || 0,
            meat: +document.getElementById('meat')?.value || 0,
            dairy: +document.getElementById('dairy')?.value || 0,
            localFood: +document.getElementById('localFood')?.value || 50,
            waste: +document.getElementById('waste')?.value || 0,
            recycled: +document.getElementById('recycled')?.value || 0,
            plastic: +document.getElementById('plasticBags')?.value || 0,
            clothing: +document.getElementById('clothing')?.value || 0,
            electronics: +document.getElementById('electronics')?.value || 0,
            streaming: +document.getElementById('streaming')?.value || 0,
            country: document.getElementById('country')?.value || 'ID'
        };
        const result = calculateFootprint(inputs);
        renderResult(result, inputs);
    });
    
    document.getElementById('saveResultBtn')?.addEventListener('click', () => {
        if (!currentResult) { alert('Calculate first!'); return; }
        saveHistoryEntry(currentResult, currentInputs);
        alert('Saved!');
    });
    
    document.getElementById('toggleChartBtn')?.addEventListener('click', () => {
        chartType = chartType === 'doughnut' ? 'bar' : 'doughnut';
        const icon = document.querySelector('#toggleChartBtn i');
        icon.className = chartType === 'doughnut' ? 'fa-solid fa-chart-pie' : 'fa-solid fa-chart-bar';
        if (currentResult) renderChart(currentResult);
    });
    
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        if (confirm('Clear all history?')) {
            history = [];
            localStorage.removeItem('ecotrack_history');
            renderHistory();
        }
    });
    
    document.getElementById('acceptCookies')?.addEventListener('click', () => {
        cookieConsent = true;
        localStorage.setItem('ecotrack_consent', 'true');
        document.getElementById('cookieConsent').style.display = 'none';
    });
    document.getElementById('declineCookies')?.addEventListener('click', () => {
        cookieConsent = false;
        localStorage.setItem('ecotrack_consent', 'false');
        document.getElementById('cookieConsent').style.display = 'none';
    });
    
    // Share buttons
    document.getElementById('shareX')?.addEventListener('click', shareToX);
    document.getElementById('shareFacebook')?.addEventListener('click', shareToFacebook);
    document.getElementById('shareLinkedIn')?.addEventListener('click', shareToLinkedIn);
    document.getElementById('shareCopy')?.addEventListener('click', copyLink);
}

// ----- MODAL & REFERENSI -----
function setupModalsAndRefs() {
    const modal = document.getElementById('howItWorksModal');
    const btn = document.getElementById('howItWorksBtn');
    const close = modal?.querySelector('.modal-close');
    btn?.addEventListener('click', () => modal.style.display = 'block');
    close?.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    
    const refDetails = {
        electricity: 'Electricity Maps — Real-time grid carbon intensity data.',
        epa: 'U.S. Environmental Protection Agency — Emission factors for transportation and waste.',
        ipcc: 'Intergovernmental Panel on Climate Change — Guidelines for national greenhouse gas inventories.',
        poore: 'Poore, J., & Nemecek, T. (2018). Reducing food’s environmental impacts through producers and consumers. Science, 360(6392), 987-992.',
        warm: 'EPA Waste Reduction Model (WARM) — Calculates GHG emissions from waste management.'
    };
    document.querySelectorAll('.ref-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const ref = link.dataset.ref;
            document.getElementById('referenceDetail').textContent = refDetails[ref] || '';
        });
    });
}
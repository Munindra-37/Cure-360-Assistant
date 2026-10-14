/**
 * AarogyaConnect 360 - Main Orchestrator with Universal Navigation History
 * Connects all roles: Patients, Hospitals, and Family Members
 */

const App = {
  currentRole: 'patient', // 'patient' | 'hospital' | 'family'
  currentPatientTab: 'overview',
  currentHospitalTab: 'queue',
  state: null,
  navHistory: [],

  TAB_NAMES: {
    'overview': 'Services Directory',
    'voice': 'Voice AI Assistant',
    'queue': 'Live OPD Queue (#44)',
    'map': 'Doctor Map & Slots',
    'pharmacy': 'Prescriptions & Meds',
    'diet': 'Diet & Meal Checker',
    'trends': 'AI Health Trends',
    'locker': 'Health Locker',
    'schemes': 'Govt Schemes / ABHA',
    'insurance': 'Insurance Concierge',
    'companion': 'Care Companion',
    'emergency': 'Emergency SOS Hub'
  },

  HOSP_TAB_NAMES: {
    'queue': 'OPD Queue & Appointments',
    'diff': 'AI 10-Day Report Diff',
    'pharmacy': 'Anti-Abuse Rx Tracker',
    'emergency': 'Emergency Fleet & Trauma'
  },

  async init() {
    await this.fetchState();

    // Initialize modules
    if (window.I18n) I18n.init();
    VoiceAI.init();
    QueueManager.init();
    DietAgent.init();
    SchemesManager.init();

    // Event listeners
    this.setupEventListeners();

    // Initial state: Patient Overview
    this.switchRole('patient', false);
    this.switchPatientTab('overview', false);
    this.updateBreadcrumb();

    // Create Lucide icons
    lucide.createIcons();

    // Initialize Dashboard Home widgets
    this.initDashboardCharts();
    setTimeout(() => this.initMiniMap(), 350);
  },

  async fetchState() {
    try {
      const res = await fetch('/api/state');
      this.state = await res.json();
      console.log("AarogyaConnect State loaded:", this.state);
      this.renderStateDependentComponents();
    } catch (e) {
      console.error("Failed to load initial state:", e);
    }
  },

  async refreshAllData() {
    await this.fetchState();
    QueueManager.fetchQueueStatus();
    if (this.currentRole === 'patient') {
      if (this.currentPatientTab === 'trends') HealthCharts.initPatientTrends();
    } else if (this.currentRole === 'hospital') {
      if (this.currentHospitalTab === 'diff') HealthCharts.initHospitalReportDiff();
    }
  },

  renderStateDependentComponents() {
    if (!this.state) return;

    // Initialize Map with doctors
    MapLocator.init(this.state.doctors);

    // Initialize Pharmacy
    PharmacyManager.init(this.state);

    // Initialize Emergency Hub
    EmergencyHub.init(this.state);

    // Render Digital Health Locker
    this.renderHealthLocker();

    // Render Insurance Concierge Desk
    this.renderInsuranceDesk();

    // Render Care Companion
    this.renderCareCompanion();

    // Render Hospital Appointments table
    this.renderHospitalAppointments();

    lucide.createIcons();
  },

  setupEventListeners() {
    // Language dropdown change
    const langSelect = document.getElementById('global-language-selector');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        if (window.I18n) {
          I18n.setLanguage(e.target.value);
        } else if (window.VoiceAI) {
          VoiceAI.setLanguage(e.target.value);
        }
      });
    }

    // Prescription form upload
    const rxForm = document.getElementById('form-rx-upload');
    if (rxForm) {
      rxForm.addEventListener('submit', (e) => PharmacyManager.uploadPrescriptionForm(e));
    }

    // Keyboard navigation (Escape key goes back or closes modal or closes map)
    // Keyboard navigation (Escape key closes any open modal or goes back)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modals = ['booking-modal', 'settings-modal', 'my-health-modal', 'appointments-overview-modal'];
        let closedModal = false;
        modals.forEach(id => {
          const m = document.getElementById(id);
          if (m && !m.classList.contains('hidden')) {
            m.classList.add('hidden');
            closedModal = true;
          }
        });
        if (!closedModal) {
          App.goBack();
        }
      }
    });

    // Close modals on clicking backdrop
    ['booking-modal', 'settings-modal', 'my-health-modal', 'appointments-overview-modal'].forEach(id => {
      const m = document.getElementById(id);
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) {
            m.classList.add('hidden');
          }
        });
      }
    });

    // Support browser back/forward buttons
    window.addEventListener('popstate', (e) => {
      if (window.VoiceAI) VoiceAI.stopAll();
      if (e.state) {
        App.switchRole(e.state.role || 'patient', false);
        if (e.state.patientTab) App.switchPatientTab(e.state.patientTab, false);
        if (e.state.hospitalTab) App.switchHospitalTab(e.state.hospitalTab, false);
        App.updateBreadcrumb();
      }
    });
  },

  navigate(role, tab = null) {
    // Record in history stack
    this.navHistory.push({
      role: this.currentRole,
      patientTab: this.currentPatientTab,
      hospitalTab: this.currentHospitalTab
    });

    try {
      history.pushState({ role, patientTab: tab, hospitalTab: this.currentHospitalTab }, '');
    } catch (_) {}

    if (role !== this.currentRole) {
      this.switchRole(role, false);
    }

    if (role === 'patient' && tab) {
      this.switchPatientTab(tab, false);
    } else if (role === 'hospital' && tab) {
      this.switchHospitalTab(tab, false);
    }

    this.updateBreadcrumb();
  },

  goBack() {
    if (window.VoiceAI) VoiceAI.stopAll();

    // 1. If modal is open, close modal
    const modal = document.getElementById('booking-modal');
    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
      return;
    }

    // 2. If in a specific patient tab other than overview, go back to overview
    if (this.currentRole === 'patient' && this.currentPatientTab !== 'overview') {
      this.switchPatientTab('overview', false);
      this.updateBreadcrumb();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 3. If in Hospital or Family, go back to Patient portal
    if (this.currentRole !== 'patient') {
      this.switchRole('patient', false);
      this.switchPatientTab('overview', false);
      this.updateBreadcrumb();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 4. Pop previous state from history if available
    if (this.navHistory.length > 0) {
      const prev = this.navHistory.pop();
      if (prev.role !== this.currentRole) this.switchRole(prev.role, false);
      if (prev.role === 'patient') this.switchPatientTab(prev.patientTab, false);
      if (prev.role === 'hospital') this.switchHospitalTab(prev.hospitalTab, false);
      this.updateBreadcrumb();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.goToPatientOverview();
    }
  },

  goToPatientOverview() {
    if (window.VoiceAI) VoiceAI.stopAll();
    this.switchRole('patient', false);
    this.switchPatientTab('overview', false);
    this.updateBreadcrumb();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  goToHome() {
    this.goToPatientOverview();
  },

  switchRole(role, recordHistory = true) {
    if (window.VoiceAI) VoiceAI.stopAll();
    if (recordHistory && role !== this.currentRole) {
      this.navHistory.push({
        role: this.currentRole,
        patientTab: this.currentPatientTab,
        hospitalTab: this.currentHospitalTab
      });
      try { history.pushState({ role, patientTab: this.currentPatientTab, hospitalTab: this.currentHospitalTab }, ''); } catch (_) {}
    }

    this.currentRole = role;

    // Update role toggle buttons
    const btnPatient = document.getElementById('btn-role-patient');
    const btnHospital = document.getElementById('btn-role-hospital');
    const btnFamily = document.getElementById('btn-role-family');

    const setActive = (btn, isActive) => {
      if (!btn) return;
      if (isActive) {
        btn.classList.remove('bg-white', 'text-slate-700', 'border', 'border-slate-200/90');
        btn.classList.add('bg-blue-600', 'text-white', 'font-bold', 'shadow-xs');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white', 'font-bold', 'shadow-xs');
        btn.classList.add('bg-white', 'text-slate-700', 'font-semibold', 'border', 'border-slate-200/90');
      }
    };

    setActive(btnPatient, role === 'patient');
    setActive(btnHospital, role === 'hospital');
    setActive(btnFamily, role === 'family');

    // Switch panels
    document.getElementById('panel-patient-role')?.classList.add('hidden');
    document.getElementById('panel-hospital-role')?.classList.add('hidden');
    document.getElementById('panel-family-role')?.classList.add('hidden');

    const targetPanel = document.getElementById(`panel-${role}-role`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
    }

    // Trigger role-specific initializations
    if (role === 'patient') {
      if (this.currentPatientTab === 'trends') HealthCharts.initPatientTrends();
      if (this.currentPatientTab === 'map' && MapLocator.map) setTimeout(() => MapLocator.map.invalidateSize(), 300);
    } else if (role === 'hospital') {
      HealthCharts.initHospitalReportDiff();
    } else if (role === 'family') {
      if (FamilyManager.authenticatedData) {
        FamilyManager.renderGuardianDashboard();
      }
    }

    this.updateBreadcrumb();
    lucide.createIcons();
  },

  switchPatientTab(tabId, recordHistory = true) {
    if (window.VoiceAI) VoiceAI.stopAll();
    if (recordHistory && tabId !== this.currentPatientTab) {
      this.navHistory.push({
        role: this.currentRole,
        patientTab: this.currentPatientTab,
        hospitalTab: this.currentHospitalTab
      });
      try { history.pushState({ role: 'patient', patientTab: tabId, hospitalTab: this.currentHospitalTab }, ''); } catch (_) {}
    }

    this.currentPatientTab = tabId;

    const overviewEl = document.getElementById('tab-content-overview');
    const subviewsContainer = document.getElementById('patient-subviews-container');

    if (tabId === 'overview') {
      if (overviewEl) overviewEl.classList.remove('hidden');
      if (subviewsContainer) subviewsContainer.classList.add('hidden');
    } else {
      if (overviewEl) overviewEl.classList.add('hidden');
      if (subviewsContainer) subviewsContainer.classList.remove('hidden');

      // Hide all subview tab contents
      document.querySelectorAll('#patient-subviews-container .patient-tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.patient-subnav-btn').forEach(el => {
        el.classList.remove('border-sky-600', 'text-sky-600', 'font-bold');
        el.classList.add('border-transparent', 'text-slate-500', 'font-medium');
      });

      // Show selected sub-tab
      const content = document.getElementById(`tab-content-${tabId}`);
      if (content) content.classList.remove('hidden');

      const navBtn = document.getElementById(`tab-btn-${tabId}`);
      if (navBtn) {
        navBtn.classList.remove('border-transparent', 'text-slate-500', 'font-medium');
        navBtn.classList.add('border-sky-600', 'text-sky-600', 'font-bold');
      }
    }

    if (tabId === 'map' && MapLocator.map) {
      setTimeout(() => MapLocator.map.invalidateSize(), 300);
    }
    if (tabId === 'trends') { setTimeout(() => HealthCharts.initPatientTrends(), 60); }

    this.updateBreadcrumb();
    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchHospitalTab(tabId, recordHistory = true) {
    if (window.VoiceAI) VoiceAI.stopAll();
    if (recordHistory && tabId !== this.currentHospitalTab) {
      this.navHistory.push({
        role: this.currentRole,
        patientTab: this.currentPatientTab,
        hospitalTab: this.currentHospitalTab
      });
      try { history.pushState({ role: 'hospital', patientTab: this.currentPatientTab, hospitalTab: tabId }, ''); } catch (_) {}
    }

    this.currentHospitalTab = tabId;

    document.querySelectorAll('.hospital-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.hospital-subnav-btn').forEach(el => {
      el.classList.remove('border-sky-600', 'text-sky-600', 'font-bold');
      el.classList.add('border-transparent', 'text-slate-500', 'font-medium');
    });

    const content = document.getElementById(`hosp-tab-content-${tabId}`);
    if (content) content.classList.remove('hidden');

    const navBtn = document.getElementById(`hosp-tab-btn-${tabId}`);
    if (navBtn) {
      navBtn.classList.remove('border-transparent', 'text-slate-500', 'font-medium');
      navBtn.classList.add('border-sky-600', 'text-sky-600', 'font-bold');
    }

    if (tabId === 'diff') { setTimeout(() => HealthCharts.initHospitalReportDiff(), 60); }

    this.updateBreadcrumb();
    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  updateBreadcrumb() {
    const globalBackBar = document.getElementById('global-breadcrumb-back-bar');
    const roleBreadcrumb = document.getElementById('global-breadcrumb-role');
    const tabBreadcrumb = document.getElementById('global-breadcrumb-tab');

    if (!globalBackBar) return;

    // Show back bar if in any subview or other role
    const isAtRootHome = (this.currentRole === 'patient' && this.currentPatientTab === 'overview');
    if (isAtRootHome) {
      globalBackBar.classList.add('hidden');
    } else {
      globalBackBar.classList.remove('hidden');
    }

    if (roleBreadcrumb) {
      if (this.currentRole === 'patient') roleBreadcrumb.innerText = 'Patient Portal';
      else if (this.currentRole === 'hospital') roleBreadcrumb.innerText = 'Hospital Desk';
      else if (this.currentRole === 'family') roleBreadcrumb.innerText = 'Family Guardian Portal';
    }

    if (tabBreadcrumb) {
      if (this.currentRole === 'patient') {
        tabBreadcrumb.innerText = this.TAB_NAMES[this.currentPatientTab] || this.currentPatientTab;
      } else if (this.currentRole === 'hospital') {
        tabBreadcrumb.innerText = this.HOSP_TAB_NAMES[this.currentHospitalTab] || this.currentHospitalTab;
      } else if (this.currentRole === 'family') {
        tabBreadcrumb.innerText = FamilyManager.authenticatedData ? 'Live Guardian View' : 'Security Verification';
      }
    }
  },

  renderHealthLocker() {
    const listEl = document.getElementById('health-locker-docs-grid');
    if (!listEl || !this.state.digital_health_locker) return;

    listEl.innerHTML = this.state.digital_health_locker.map(doc => `
      <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-sky-300 transition space-y-2">
        <div class="flex items-start justify-between">
          <div class="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
            <i data-lucide="file-text" class="w-5 h-5"></i>
          </div>
          <span class="badge-pill bg-sky-100 text-sky-800 text-[10px]">
            ${doc.category}
          </span>
        </div>
        <div>
          <h4 class="font-bold text-slate-800 text-sm truncate" title="${doc.title}">${doc.title}</h4>
          <p class="text-xs text-slate-500">${doc.hospital} • ${doc.date}</p>
        </div>
        <div class="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
          <span class="text-slate-400 font-mono">${doc.file_size}</span>
          <button onclick="App.showToast('Secure medical document download initiated.', 'info')" class="text-sky-600 hover:text-sky-700 font-bold flex items-center gap-1">
            <i data-lucide="download" class="w-3.5 h-3.5"></i> Download
          </button>
        </div>
      </div>
    `).join('');
  },

  async uploadLockerDocument() {
    const title = prompt("Enter Document Title (e.g. Echo Cardiogram Oct 2026):", "Echo Cardiogram Scan");
    if (!title) return;
    const category = prompt("Enter Category (Lab Report / Scan / Discharge Summary / Hospital Bill):", "Lab Report");

    try {
      const res = await fetch('/api/health_locker/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          category: category || "Medical Report",
          doctor: "Apollo Diagnostics Central"
        })
      });
      const data = await res.json();
      if (data.status === 'success') {
        this.showToast("Document saved to your Digital Health Locker!", "success");
        this.refreshAllData();
      }
    } catch (e) {
      this.showToast("Failed to upload document", "error");
    }
  },

  renderInsuranceDesk() {
    const insContainer = document.getElementById('insurance-desk-card');
    if (!insContainer || !this.state.insurance_support) return;

    const ins = this.state.insurance_support;
    insContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Agent Profile -->
        <div class="p-5 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-2xl shadow-sm text-center space-y-3">
          <div class="w-20 h-20 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center mx-auto text-2xl shadow-md border-2 border-white">
            AV
          </div>
          <div>
            <h4 class="font-extrabold text-slate-900 text-base">${ins.human_agent.name}</h4>
            <p class="text-xs font-semibold text-sky-700">${ins.human_agent.designation}</p>
            <span class="inline-block mt-2 badge-pill bg-emerald-100 text-emerald-800 text-xs font-bold">
              ● ${ins.human_agent.availability}
            </span>
          </div>
          <p class="text-xs text-slate-500">Dedicated concierge assisting you with hospital paperwork, cashless claim approvals, and TPA documentation.</p>
          <div class="pt-2 flex flex-col gap-2">
            <a href="tel:${ins.human_agent.phone}" class="py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-sm transition">
              📞 Direct Call (${ins.human_agent.phone})
            </a>
            <button onclick="App.showToast('Connecting you to Claims Desk chat with Aakash Verma...', 'info')" class="py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl text-xs transition">
              💬 Start Claim Chat
            </button>
          </div>
        </div>

        <!-- Policy & Checklist -->
        <div class="md:col-span-2 space-y-4">
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <span class="text-xs text-slate-400 font-mono">Policy #${ins.policy_number}</span>
              <h4 class="font-bold text-slate-900 text-base">${ins.provider}</h4>
              <p class="text-xs text-emerald-700 font-semibold mt-0.5">${ins.claim_status}</p>
            </div>
            <div class="text-right">
              <span class="text-xs text-slate-400">Sum Insured</span>
              <div class="text-lg font-black text-sky-700">${ins.sum_insured}</div>
            </div>
          </div>

          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
            <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500">Pre-Authorization & Paperwork Checklist</h5>
            <div class="space-y-1.5">
              ${ins.paperwork_checklist.map(c => `
                <div class="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                  <span class="text-slate-800 font-medium">• ${c.item}</span>
                  <span class="font-bold text-emerald-700">✓ ${c.status}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderCareCompanion() {
    const careContainer = document.getElementById('care-companion-card');
    if (!careContainer || !this.state.care_companion) return;

    const care = this.state.care_companion;
    careContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Caretaker Profile -->
        <div class="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl shadow-sm text-center space-y-3">
          <div class="w-20 h-20 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center mx-auto text-2xl shadow-md border-2 border-white">
            PN
          </div>
          <div>
            <h4 class="font-extrabold text-slate-900 text-base">${care.agent_name}</h4>
            <p class="text-xs font-semibold text-emerald-800">${care.qualification}</p>
            <span class="inline-block mt-2 badge-pill bg-emerald-100 text-emerald-800 text-xs font-bold">
              ● ${care.status}
            </span>
          </div>
          <p class="text-xs text-slate-600 leading-relaxed">${care.notes}</p>
          <div class="pt-2 flex flex-col gap-2">
            <a href="tel:${care.phone}" class="py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition">
              📞 Call Caregiver (${care.phone})
            </a>
            <button onclick="App.simulateLogVital()" class="py-2 bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold rounded-xl text-xs transition">
              + Log Instant Vitals Reading
            </button>
          </div>
        </div>

        <!-- Live Vitals Stream -->
        <div class="md:col-span-2 space-y-4">
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <h5 class="text-xs font-bold uppercase tracking-wider text-slate-500">Live Health Monitoring Log (Synced with Hospital & Family)</h5>
              <span class="badge-pill bg-sky-100 text-sky-800 text-[10px]">Real-time Sync</span>
            </div>
            <div class="space-y-2">
              ${care.live_vitals_feed.map(feed => `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div class="flex items-center justify-between font-bold text-slate-700">
                    <span>${feed.time}</span>
                    <span class="text-emerald-700 font-semibold">${feed.condition}</span>
                  </div>
                  <div class="grid grid-cols-4 gap-2 text-slate-800 font-mono pt-1">
                    <div>BP: <strong>${feed.bp}</strong></div>
                    <div>SpO2: <strong class="text-emerald-700">${feed.spo2}</strong></div>
                    <div>Pulse: <strong class="text-sky-700">${feed.pulse}</strong></div>
                    <div>Sugar: <strong>${feed.sugar}</strong></div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async simulateLogVital() {
    const bp = prompt("Enter Blood Pressure (e.g. 121/79 mmHg):", "121/79 mmHg");
    if (!bp) return;
    const pulse = prompt("Enter Pulse (bpm):", "75 bpm");
    const spo2 = prompt("Enter SpO2 (%):", "99%");
    const sugar = prompt("Enter Blood Glucose (mg/dL):", "118 mg/dL");
    const note = prompt("Enter Caregiver observation note:", "Patient alert and comfortable after dinner");

    try {
      const res = await fetch('/api/care_companion/log_vital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bp: bp,
          spo2: spo2 || "99%",
          pulse: pulse || "75 bpm",
          sugar: sugar || "118 mg/dL",
          note: note || "Routine checkup"
        })
      });

      const data = await res.json();
      if (data.status === 'success') {
        this.showToast("Vital reading logged! Synced to Hospital & Family portal.", "success");
        this.refreshAllData();
      }
    } catch (e) {
      this.showToast("Failed to log vital", "error");
    }
  },

  renderHospitalAppointments() {
    const tbody = document.getElementById('hospital-apts-table-body');
    if (!tbody || !this.state.appointments) return;

    tbody.innerHTML = this.state.appointments.map(a => `
      <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
        <td class="py-3 px-3 font-mono font-bold text-sky-700">#${a.token_number}</td>
        <td class="py-3 px-3 font-bold text-slate-900">${a.patient_name}</td>
        <td class="py-3 px-3 text-slate-600">${a.reason}</td>
        <td class="py-3 px-3 text-slate-700 font-semibold">${a.date} @ ${a.slot}</td>
        <td class="py-3 px-3">
          <span class="badge-pill bg-sky-100 text-sky-800 text-[10px]">
            ${a.status}
          </span>
        </td>
      </tr>
    `).join('');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let bg = 'bg-slate-900 text-white';
    if (type === 'success') bg = 'bg-emerald-600 text-white';
    if (type === 'error') bg = 'bg-red-600 text-white';
    if (type === 'warning') bg = 'bg-amber-600 text-white';

    toast.className = `${bg} px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 transition-all transform duration-300 translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 50);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  initDashboardCharts() {
    // Pre-load patient health trends in the background so graph is instantly ready
    if (window.HealthCharts) {
      HealthCharts.initPatientTrends();
    }
    // Update vitals numbers if live state is available
    if (this.state && this.state.care_companion && this.state.care_companion.live_vitals_feed) {
      const feeds = this.state.care_companion.live_vitals_feed;
      if (feeds.length > 0) {
        const latest = feeds[feeds.length - 1];
        const hrEl = document.getElementById('vital-val-hr');
        if (hrEl && latest.pulse) hrEl.innerText = latest.pulse.replace(/[^0-9]/g, '') || '72';
        const spo2El = document.getElementById('vital-val-spo2');
        if (spo2El && latest.spo2) spo2El.innerText = latest.spo2.replace(/[^0-9]/g, '') || '98';
        const bpEl = document.getElementById('vital-val-bp');
        if (bpEl && latest.bp) bpEl.innerText = latest.bp.replace(' mmHg', '') || '120/80';
        const gluEl = document.getElementById('vital-val-glucose');
        if (gluEl && latest.sugar) gluEl.innerText = latest.sugar.replace(/[^0-9]/g, '') || '105';
      }
    }
  },

  initMiniMap() {
    const miniEl = document.getElementById('mini-map-preview');
    if (!miniEl || this._miniMapInitialized) return;
    try {
      this._miniMap = L.map('mini-map-preview', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
      }).setView([12.9279, 77.6771], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 16
      }).addTo(this._miniMap);

      // User location marker
      L.circleMarker([12.9279, 77.6771], {
        radius: 8,
        fillColor: '#0284c7',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(this._miniMap);

      // Nearby doctor markers
      const docs = [
        [12.9340, 77.6830],
        [12.9210, 77.6710],
        [12.9300, 77.6910],
        [12.9190, 77.6850]
      ];
      docs.forEach(pos => {
        L.circleMarker(pos, {
          radius: 5,
          fillColor: '#0d9488',
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.95
        }).addTo(this._miniMap);
      });
      this._miniMapInitialized = true;
    } catch (e) {
      console.warn("Mini map init notice:", e);
    }
  },

  triggerHomeVoiceAI() {
    this.switchPatientTab('voice');
    setTimeout(() => {
      if (window.VoiceAI) VoiceAI.startListening();
    }, 250);
  },

  markHomeMedTaken() {
    this.markSpecificMedTaken('btn-home-mark-taken', 'Metformin 500 mg');
  },

  markSpecificMedTaken(btnId, medName) {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (btn.dataset.taken === 'true') {
        this.showToast(`${medName} is already recorded as taken for today.`, 'info');
        return;
      }
      btn.dataset.taken = 'true';
      btn.innerHTML = '<div class="w-4 h-4 rounded-full bg-[#065f46] text-white flex items-center justify-center text-[10px]">✓</div> <span>Taken</span>';
      btn.className = 'med-mark-taken-btn shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-500 text-xs font-bold transition shadow-xs cursor-default opacity-85';
      
      // Update badge count
      const badge = document.getElementById('reminders-badge-count');
      if (badge) {
        let count = parseInt(badge.innerText, 10);
        if (!isNaN(count) && count > 0) {
          count -= 1;
          badge.innerText = count;
          if (count === 0) {
            badge.classList.add('hidden');
          }
        }
      }
      lucide.createIcons();
    }
    this.showToast(`✓ ${medName} marked as taken for today! Dose recorded.`, 'success');
  },

  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.remove('hidden');
      lucide.createIcons();
    }
  },

  openMyHealthModal() {
    const modal = document.getElementById('my-health-modal');
    if (modal) {
      modal.classList.remove('hidden');
      lucide.createIcons();
    }
  },

  openAppointmentsModal() {
    const modal = document.getElementById('appointments-overview-modal');
    if (modal) {
      modal.classList.remove('hidden');
      lucide.createIcons();
    }
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

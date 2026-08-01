import { supabase } from '../src/lib/supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    // IST time helper
    const getISTDate = () => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
    };

    const formatDateISO = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    // Market Status Logic (09:00 AM - 07:00 PM IST)
    const updateMarketStatus = () => {
        const ist = getISTDate();
        const hours = ist.getHours();
        const isOpen = hours >= 9 && hours < 19;
        const statusBadge = document.getElementById('market-status');
        if (statusBadge) {
            statusBadge.innerText = isOpen ? 'LIVE' : 'CLOSED';
            statusBadge.className = isOpen
                ? 'badge badge-live animate-pulse font-label-caps text-xs'
                : 'badge badge-closed font-label-caps text-xs';
        }
    };
    updateMarketStatus();
    setInterval(updateMarketStatus, 60000);

    // Fetch and Populate CMS Content
    const fetchSiteContent = async () => {
        try {
            const { data, error } = await supabase
                .from('site_content')
                .select('*')
                .eq('id', 1)
                .single();
                
            if (error) throw error;
            if (data) {
                const updateElement = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.innerText = value || '';
                        el.classList.remove('skeleton-text', 'skeleton-value', 'skeleton-meta', 'skeleton-marquee');
                    }
                };
                
                const ist = getISTDate();
                const todayStr = formatDateISO(ist);
                
                // Check if admin has set today's number yet (resets at 12 AM)
                let actualTodayNum = '-';
                let actualTodayMeta = '';
                
                try {
                    const { data: todayHist } = await supabase
                        .from('historical_results')
                        .select('lucky_number')
                        .eq('result_date', todayStr)
                        .maybeSingle();
                        
                    if (todayHist && todayHist.lucky_number && todayHist.lucky_number !== '-') {
                        actualTodayNum = todayHist.lucky_number;
                        actualTodayMeta = data.today_lucky_meta;
                    }
                } catch (e) {
                    console.error('Error fetching today history:', e);
                }

                updateElement('ui-prev-num', data.previous_number);
                updateElement('ui-prev-meta', data.previous_lucky_meta);
                updateElement('ui-today-num', actualTodayNum);
                updateElement('ui-today-meta', actualTodayMeta);

                // Live Market Board Time Logic (9 PM to 9 AM)
                const marketResult = document.getElementById('market-result');
                if (marketResult) {
                    const hours = ist.getHours();
                    const showNumber = hours >= 21 || hours < 9;
                    marketResult.innerText = showNumber ? (data.today_number || '-') : '-';
                }

                const uiMarketName = document.getElementById('ui-market-name');
                if (uiMarketName && data.market_name) {
                    uiMarketName.innerHTML = data.market_name + ' <span class="material-symbols-outlined icon-filled text-primary-bold" style="font-size: 16px;">star</span>';
                }
                const uiMarketOpen = document.getElementById('ui-market-open');
                if (uiMarketOpen && data.market_open_time) uiMarketOpen.innerText = data.market_open_time;
                const uiMarketClose = document.getElementById('ui-market-close');
                if (uiMarketClose && data.market_close_time) uiMarketClose.innerText = data.market_close_time;

                // Yesterday Results Sidebar - Auto-Categorized by Close Time
                let closeHour = 21; // Default 9 PM
                if (data.market_close_time) {
                    const match = data.market_close_time.match(/(\d+):(\d+)\s*(AM|PM)/i);
                    if (match) {
                        let h = parseInt(match[1]);
                        const isPM = match[3].toUpperCase() === 'PM';
                        if (isPM && h !== 12) h += 12;
                        if (!isPM && h === 12) h = 0;
                        closeHour = h;
                    }
                }

                let targetCategory = 'night';
                if (closeHour >= 6 && closeHour < 12) targetCategory = 'morning';
                else if (closeHour >= 12 && closeHour < 17) targetCategory = 'day';
                else if (closeHour >= 17 && closeHour < 20) targetCategory = 'evening';

                updateElement('ui-yesterday-morning', targetCategory === 'morning' ? (data.previous_number || '-') : '-');
                updateElement('ui-yesterday-day', targetCategory === 'day' ? (data.previous_number || '-') : '-');
                updateElement('ui-yesterday-evening', targetCategory === 'evening' ? (data.previous_number || '-') : '-');
                updateElement('ui-yesterday-night', targetCategory === 'night' ? (data.previous_number || '-') : '-');
            }
        } catch (error) {
            console.error('Error fetching site content:', error);
        }
    };
    
    // Call it immediately on load
    fetchSiteContent();

    // Historical Results Logic
    let historyPage = 0;
    const HISTORY_PAGE_SIZE = 15;
    let historyFilterDate = null;

    const fetchHistoricalResults = async (append = false) => {
        const tbody = document.getElementById('history-table-body');
        const loadMoreBtn = document.getElementById('btn-load-more-history');
        if (!tbody) return;

        if (!append) {
            historyPage = 0;
            tbody.innerHTML = '<tr><td colspan="2" class="td-center td-muted" style="padding: 24px;">Loading...</td></tr>';
        }

        try {
            let query = supabase
                .from('historical_results')
                .select('*')
                .order('result_date', { ascending: false });

            if (historyFilterDate) {
                query = query.eq('result_date', historyFilterDate);
            }

            const from = historyPage * HISTORY_PAGE_SIZE;
            const to = from + HISTORY_PAGE_SIZE - 1;
            query = query.range(from, to);

            const { data, error } = await query;
            if (error) throw error;

            if (!append) tbody.innerHTML = '';

            if (data && data.length > 0) {
                data.forEach((row, i) => {
                    const tr = document.createElement('tr');
                    if (i % 2 === 1) tr.classList.add('highlight-row');
                    const dateObj = new Date(row.result_date + 'T00:00:00');
                    const dateStr = dateObj.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
                    tr.innerHTML = `
                        <td class="font-medium">${dateStr}</td>
                        <td class="font-data-cell td-right">${row.lucky_number || '---'}</td>
                    `;
                    tbody.appendChild(tr);
                });
                if (loadMoreBtn) {
                    loadMoreBtn.classList.toggle('hidden', data.length < HISTORY_PAGE_SIZE || !!historyFilterDate);
                }
            } else if (!append) {
                tbody.innerHTML = '<tr><td colspan="2" class="td-center td-muted" style="padding: 24px;">No records found.</td></tr>';
                if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error fetching historical results:', error);
            if (!append) {
                tbody.innerHTML = '<tr><td colspan="2" class="td-center td-muted" style="padding: 24px;">Failed to load data.</td></tr>';
            }
        }
    };
    fetchHistoricalResults();

    // History date filter
    const btnHistorySearch = document.getElementById('btn-history-search');
    const btnHistoryClear = document.getElementById('btn-history-clear');
    const historyDateInput = document.getElementById('history-date-filter');

    if (btnHistorySearch && historyDateInput) {
        btnHistorySearch.addEventListener('click', () => {
            const val = historyDateInput.value;
            if (val) {
                historyFilterDate = val;
                fetchHistoricalResults();
                if (btnHistoryClear) btnHistoryClear.classList.remove('hidden');
            }
        });
    }
    if (btnHistoryClear && historyDateInput) {
        btnHistoryClear.addEventListener('click', () => {
            historyFilterDate = null;
            historyDateInput.value = '';
            btnHistoryClear.classList.add('hidden');
            fetchHistoricalResults();
        });
    }

    const loadMoreBtn = document.getElementById('btn-load-more-history');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            historyPage++;
            fetchHistoricalResults(true);
        });
    }

    // Mobile Menu Toggle Logic
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            const isDisplayed = window.getComputedStyle(navLinks).display !== 'none';
            if (isDisplayed) {
                navLinks.style.display = 'none';
            } else {
                navLinks.style.display = 'flex';
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.backgroundColor = 'var(--color-surface)';
                navLinks.style.padding = '16px';
                navLinks.style.borderBottom = '1px solid var(--color-outline-variant)';
                navLinks.style.boxShadow = 'var(--shadow-md)';
            }
        });
    }

    // Handle Tabs in Analysis Section
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active', 'hidden'));
            tabContents.forEach(tc => tc.style.display = 'none');
            
            e.target.classList.add('active');
            const targetId = e.target.getAttribute('data-tab');
            const targetContent = document.getElementById(targetId);
            if(targetContent) {
                targetContent.style.display = 'block';
                targetContent.classList.add('active');
            }
        });
    });

    // Global site_content cache for charts
    let siteContentCache = null;

    // Fetch Site Content Cache wrapper
    const getSiteContent = async () => {
        if (siteContentCache) return siteContentCache;
        const { data } = await supabase.from('site_content').select('*').eq('id', 1).single();
        siteContentCache = data;
        return data;
    };

    // --- Weekly Grid Logic ---
    const getWeekDates = () => {
        const ist = getISTDate();
        const day = ist.getDay();
        const diff = ist.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(ist.setDate(diff));
        const dates = [];
        for(let i=0; i<7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(formatDateISO(d));
        }
        return dates;
    };

    const renderWeeklyGrid = async () => {
        try {
            const content = await getSiteContent();
            const overrides = content?.weekly_override || {};
            const weekDates = getWeekDates();
            const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
            const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            
            // Auto fetch current week from historical results
            const { data: histData } = await supabase
                .from('historical_results')
                .select('*')
                .in('result_date', weekDates);
            
            const historyMap = {};
            if(histData) {
                histData.forEach(row => historyMap[row.result_date] = row.lucky_number);
            }

            days.forEach((day, index) => {
                const el = document.getElementById('wg-' + day);
                if(el) {
                    const dateStr = weekDates[index];
                    const overrideVal = overrides[dayNames[index]];
                    const autoVal = historyMap[dateStr];
                    
                    if (overrideVal && overrideVal.trim() !== '') {
                        el.innerText = overrideVal;
                    } else if (autoVal) {
                        el.innerText = autoVal;
                    } else {
                        el.innerText = '---';
                    }
                }
            });
        } catch (err) {
            console.error("Weekly grid error:", err);
        }
    };
    renderWeeklyGrid();

    // --- Hot Numbers Logic ---
    const hotNumbersRange = document.getElementById('hot-numbers-range');
    
    // Helper to calculate top numbers (used by both public chart and admin preview)
    const getHotNumbersData = async (rangeVal) => {
        let query = supabase.from('historical_results').select('lucky_number');
        if (rangeVal !== 'all') {
            const days = parseInt(rangeVal);
            const pastDate = getISTDate();
            pastDate.setDate(pastDate.getDate() - days);
            query = query.gte('result_date', formatDateISO(pastDate));
        }
        
        const { data, error } = await query;
        if (error) throw error;

        const counts = {};
        if (data) {
            data.forEach(row => {
                const num = row.lucky_number;
                if (num && num.trim() !== '') {
                    counts[num] = (counts[num] || 0) + 1;
                }
            });
        }
        
        // Sort descending by frequency
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => ({ val: entry[0], freq: entry[1] }));
    };

    const renderHotNumbers = async () => {
        const chartContainer = document.getElementById('hot-numbers-chart');
        if(!chartContainer) return;

        try {
            const content = await getSiteContent();
            // Init dropdown based on DB default if first load
            if(!hotNumbersRange.hasAttribute('data-init') && content?.hot_numbers_range) {
                hotNumbersRange.value = content.hot_numbers_range;
                hotNumbersRange.setAttribute('data-init', 'true');
            }

            const rangeVal = hotNumbersRange.value; // '7', '30', 'all'
            const isAuto = content?.hot_numbers_auto !== false;
            let topNumbers = [];
            
            if (isAuto) {
                topNumbers = await getHotNumbersData(rangeVal);
            }

            // Mix in pinned numbers at the top
            const pinnedList = content?.pinned_hot_numbers || [];
            const finalDisplay = [];
            
            // Add pinned first
            pinnedList.forEach(pin => {
                finalDisplay.push({ val: pin, isPinned: true });
            });
            
            // Add auto-detected, avoiding duplicates with pinned
            topNumbers.forEach(item => {
                if (!pinnedList.includes(item.val) && finalDisplay.length < 5) {
                    finalDisplay.push({ val: item.val, freq: item.freq, isPinned: false });
                }
            });

            // Render list
            chartContainer.innerHTML = '';
            if (finalDisplay.length === 0) {
                chartContainer.innerHTML = '<div class="td-muted text-center py-4 w-full text-sm">No data available</div>';
                return;
            }

            finalDisplay.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = `hot-list-item ${item.isPinned ? 'pinned' : ''}`;
                
                let rightContent = '';
                if (item.isPinned) {
                    rightContent = `<span class="pinned-badge">Pinned</span>`;
                } else if (item.freq) {
                    rightContent = `<span class="hot-list-freq">${item.freq}x</span>`;
                }

                div.innerHTML = `
                    <div class="hot-list-left">
                        <span class="hot-list-rank">#${index + 1}</span>
                        <span class="hot-list-val">${item.val}</span>
                    </div>
                    <div>
                        ${rightContent}
                    </div>
                `;
                chartContainer.appendChild(div);
            });

        } catch (err) {
            console.error("Hot numbers error:", err);
            chartContainer.innerHTML = '<div class="td-muted text-center py-4 w-full text-sm">Failed to load chart</div>';
        }
    };
    renderHotNumbers();

    if(hotNumbersRange) {
        hotNumbersRange.addEventListener('change', renderHotNumbers);
    }

    // Auth Modal Logic
    const authModal = document.getElementById('auth-modal');
    const btnNavSignin = document.getElementById('btn-nav-signin');
    const modalClose = document.getElementById('modal-close');
    
    // Steps
    const stepRoleSelection = document.getElementById('step-role-selection');
    const stepAdminLogin = document.getElementById('step-admin-login');
    const stepConsumerLogin = document.getElementById('step-consumer-login');
    
    const steps = [stepRoleSelection, stepAdminLogin, stepConsumerLogin];
    
    const goToStep = (stepElement) => {
        steps.forEach(step => {
            if (step) step.classList.add('hidden');
        });
        if (stepElement) stepElement.classList.remove('hidden');
        
        // Hide errors when switching steps
        hideError(adminError);
        hideError(consumerError);
    };

    // Open / Close
    if (btnNavSignin && authModal) {
        btnNavSignin.addEventListener('click', () => {
            authModal.classList.remove('hidden');
            goToStep(stepRoleSelection);
            
            // Reset consumer flow on open
            if (consumerEmailStep && consumerPasswordStep) {
                consumerEmailStep.classList.remove('hidden');
                consumerPasswordStep.classList.add('hidden');
                if (consumerEmailInput) consumerEmailInput.value = '';
                if (consumerPasswordInput) consumerPasswordInput.value = '';
            }
        });
        
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                authModal.classList.add('hidden');
            });
        }
        
        // Close on clicking outside container
        authModal.addEventListener('click', (e) => {
            if (e.target === authModal) {
                authModal.classList.add('hidden');
            }
        });
    }

    // Role Selection
    const btnAdminLogin = document.getElementById('btn-admin-login');
    const btnConsumerLogin = document.getElementById('btn-consumer-login');
    let currentRole = 'consumer'; // default
    
    if (btnAdminLogin) btnAdminLogin.addEventListener('click', () => {
        currentRole = 'admin';
        goToStep(stepAdminLogin);
    });
    if (btnConsumerLogin) btnConsumerLogin.addEventListener('click', () => {
        currentRole = 'consumer';
        goToStep(stepConsumerLogin);
    });
    
    // Back Buttons
    const backButtons = document.querySelectorAll('.btn-back');
    backButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);
            if (targetElement) goToStep(targetElement);
        });
    });

    // Consumer Auth Flow Logic
    const tabSignin = document.getElementById('tab-signin');
    const tabSignup = document.getElementById('tab-signup');
    const googleBtnText = document.getElementById('google-btn-text');
    const btnConsumerSubmit = document.getElementById('btn-consumer-submit');
    
    let isSignup = false;

    const updateConsumerTabs = () => {
        if (isSignup) {
            if (tabSignup) tabSignup.classList.add('active');
            if (tabSignin) tabSignin.classList.remove('active');
            if (googleBtnText) googleBtnText.innerText = 'Sign up with Google';
            if (btnConsumerSubmit) btnConsumerSubmit.querySelector('.btn-text').innerText = 'Create Account';
        } else {
            if (tabSignin) tabSignin.classList.add('active');
            if (tabSignup) tabSignup.classList.remove('active');
            if (googleBtnText) googleBtnText.innerText = 'Sign in with Google';
            if (btnConsumerSubmit) btnConsumerSubmit.querySelector('.btn-text').innerText = 'Log In';
        }
        hideError(consumerError);
    };

    if (tabSignin) tabSignin.addEventListener('click', () => { isSignup = false; updateConsumerTabs(); });
    if (tabSignup) tabSignup.addEventListener('click', () => { isSignup = true; updateConsumerTabs(); });

    // Email -> Password step transition
    const consumerEmailStep = document.getElementById('consumer-email-step');
    const consumerPasswordStep = document.getElementById('consumer-password-step');
    const btnConsumerNext = document.getElementById('btn-consumer-next');
    const btnEditEmail = document.getElementById('btn-edit-email');
    const consumerEmailInput = document.getElementById('consumer-email');
    const displayEmail = document.getElementById('display-email');
    const consumerPasswordInput = document.getElementById('consumer-password');

    if (btnConsumerNext) {
        btnConsumerNext.addEventListener('click', () => {
            if (consumerEmailInput && consumerEmailInput.value.trim() !== '') {
                if (displayEmail) displayEmail.innerText = consumerEmailInput.value.trim();
                if (consumerEmailStep) consumerEmailStep.classList.add('hidden');
                if (consumerPasswordStep) consumerPasswordStep.classList.remove('hidden');
            } else if (consumerEmailInput) {
                consumerEmailInput.reportValidity();
            }
        });
    }

    if (btnEditEmail) {
        btnEditEmail.addEventListener('click', () => {
            if (consumerPasswordStep) consumerPasswordStep.classList.add('hidden');
            if (consumerEmailStep) consumerEmailStep.classList.remove('hidden');
        });
    }

    // SUPABASE INTEGRATION LOGIC

    // Error and Spinner helpers
    const adminError = document.getElementById('admin-error');
    const consumerError = document.getElementById('consumer-error');
    
    const showError = (element, message) => {
        if(element) {
            element.innerText = message;
            element.classList.remove('hidden');
        }
    };
    const hideError = (element) => {
        if(element) {
            element.classList.add('hidden');
        }
    };
    const toggleLoading = (btn, isLoading) => {
        if(!btn) return;
        const textSpan = btn.querySelector('.btn-text') || btn.querySelector('span:not(.spinner):not(.google-icon)');
        const spinner = btn.querySelector('.spinner');
        if (isLoading) {
            if(textSpan) textSpan.style.opacity = '0';
            if(spinner) spinner.classList.remove('hidden');
            btn.disabled = true;
        } else {
            if(textSpan) textSpan.style.opacity = '1';
            if(spinner) spinner.classList.add('hidden');
            btn.disabled = false;
        }
    };

    // Save/Update User Profile in Supabase
    const saveUserProfile = async (user, role) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    avatar_url: user.user_metadata?.avatar_url || null,
                    role: role
                }, { onConflict: 'id' });
            
            if (error) {
                console.error("Error saving user profile:", error);
            }
        } catch (error) {
            console.error("Error saving user profile:", error);
        }
    };

    // Google Auth
    const btnGoogleAuth = document.getElementById('btn-google-auth');
    if (btnGoogleAuth) {
        btnGoogleAuth.addEventListener('click', async () => {
            hideError(consumerError);
            toggleLoading(btnGoogleAuth, true);
            try {
                // Supabase OAuth redirects to Google, so we set a flag in localStorage to know the role after redirect
                localStorage.setItem('authRole', currentRole);
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                });
                if (error) throw error;
                // Note: authModal will close after redirect, but just in case:
                authModal.classList.add('hidden');
            } catch (error) {
                showError(consumerError, error.message);
            } finally {
                toggleLoading(btnGoogleAuth, false);
            }
        });
    }

    // Email/Password Auth (Consumer)
    if (btnConsumerSubmit) {
        btnConsumerSubmit.addEventListener('click', async () => {
            const email = consumerEmailInput.value.trim();
            const password = consumerPasswordInput.value;
            
            if (!password) {
                consumerPasswordInput.reportValidity();
                return;
            }

            hideError(consumerError);
            toggleLoading(btnConsumerSubmit, true);

            try {
                let authResponse;
                if (isSignup) {
                    authResponse = await supabase.auth.signUp({
                        email,
                        password,
                    });
                } else {
                    authResponse = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });
                }
                
                if (authResponse.error) throw authResponse.error;
                
                if (authResponse.data?.user) {
                    await saveUserProfile(authResponse.data.user, currentRole);
                }
                authModal.classList.add('hidden');
            } catch (error) {
                showError(consumerError, error.message);
            } finally {
                toggleLoading(btnConsumerSubmit, false);
            }
        });
    }

    // Email/Password Auth (Admin)
    const btnAdminSubmit = document.getElementById('btn-admin-submit');
    const adminEmailInput = document.getElementById('admin-email');
    const adminPasswordInput = document.getElementById('admin-password');
    const adminForm = document.getElementById('admin-form');

    if (adminForm) {
        adminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = adminEmailInput.value.trim();
            const password = adminPasswordInput.value;

            hideError(adminError);
            toggleLoading(btnAdminSubmit, true);

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                
                if (error) throw error;
                
                if (data?.user) {
                    await saveUserProfile(data.user, 'admin');
                }
                authModal.classList.add('hidden');
            } catch (error) {
                showError(adminError, error.message);
            } finally {
                toggleLoading(btnAdminSubmit, false);
            }
        });
    }

    // Dynamic Navbar UI Update via onAuthStateChange
    const navProfileMenu = document.getElementById('nav-profile-menu');
    const profileImg = document.getElementById('profile-img');
    const profileInitial = document.getElementById('profile-initial');
    const btnProfileToggle = document.getElementById('btn-profile-toggle');
    const profileDropdown = document.getElementById('profile-dropdown');
    const btnLogout = document.getElementById('btn-logout');
    
    const dropdownName = document.getElementById('dropdown-name');
    const dropdownEmail = document.getElementById('dropdown-email');
    const dropdownRole = document.getElementById('dropdown-role');

    // Handle OAuth redirect profile upsert
    supabase.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        
        if (event === 'SIGNED_IN' && user) {
            // Check if we just redirected back from Google
            const pendingRole = localStorage.getItem('authRole');
            if (pendingRole) {
                await saveUserProfile(user, pendingRole);
                localStorage.removeItem('authRole');
            }
        }

        if (user) {
            // Logged In
            if(btnNavSignin) btnNavSignin.classList.add('hidden');
            if(navProfileMenu) navProfileMenu.classList.remove('hidden');
            
            // Admin Panel Visibility
            const btnAdminPanel = document.getElementById('btn-admin-panel');
            if (user.email === 'contact@ankbazar.in') {
                if(btnAdminPanel) btnAdminPanel.classList.remove('hidden');
            } else {
                if(btnAdminPanel) btnAdminPanel.classList.add('hidden');
            }
            
            // Set Avatar
            const avatarUrl = user.user_metadata?.avatar_url;
            if (avatarUrl) {
                profileImg.src = avatarUrl;
                profileImg.classList.remove('hidden');
                profileInitial.classList.add('hidden');
            } else {
                profileImg.classList.add('hidden');
                profileInitial.classList.remove('hidden');
                const initial = user.email ? user.email.charAt(0).toUpperCase() : 'U';
                profileInitial.innerText = initial;
            }

            // Set Dropdown Info
            if(dropdownEmail) dropdownEmail.innerText = user.email || 'No email';
            if(dropdownName) dropdownName.innerText = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
            
            // Fetch role from Supabase profiles table
            if(dropdownRole) {
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', user.id)
                        .single();
                        
                    if (data && !error) {
                        dropdownRole.innerText = data.role || 'consumer';
                    } else {
                        dropdownRole.innerText = 'consumer';
                    }
                } catch(e) {
                    dropdownRole.innerText = 'consumer';
                }
            }
            
        } else {
            // Logged Out
            if(btnNavSignin) btnNavSignin.classList.remove('hidden');
            if(navProfileMenu) navProfileMenu.classList.add('hidden');
            if(profileDropdown) profileDropdown.classList.add('hidden');
        }
    });

    // Profile Dropdown Toggle Logic
    if (btnProfileToggle && profileDropdown) {
        btnProfileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !btnProfileToggle.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });
    }

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                profileDropdown.classList.add('hidden');
            } catch (error) {
                console.error("Error signing out:", error);
            }
        });
    }

    // Admin CMS Panel Logic
    const adminPanelModal = document.getElementById('admin-panel-modal');
    const adminModalClose = document.getElementById('admin-modal-close');
    const adminCmsForm = document.getElementById('admin-cms-form');
    const adminPrevNum = document.getElementById('admin-prev-num');
    const adminPrevMeta = document.getElementById('admin-prev-meta');
    const adminTodayNum = document.getElementById('admin-today-num');
    const adminTodayMeta = document.getElementById('admin-today-meta');
    const btnAdminSave = document.getElementById('btn-admin-save');
    const adminUpdateSuccess = document.getElementById('admin-update-success');
    const adminUpdateError = document.getElementById('admin-update-error');
    const btnAdminPanelMenu = document.getElementById('btn-admin-panel');

    if (btnAdminPanelMenu && adminPanelModal) {
        btnAdminPanelMenu.addEventListener('click', () => {
            if(profileDropdown) profileDropdown.classList.add('hidden');
            adminPanelModal.classList.remove('hidden');
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            
            // Populate Lucky Numbers from DOM
            const uiPrevNum = document.getElementById('ui-prev-num');
            const uiPrevMeta = document.getElementById('ui-prev-meta');
            const uiTodayNum = document.getElementById('ui-today-num');
            const uiTodayMeta = document.getElementById('ui-today-meta');
            if (adminPrevNum && uiPrevNum) adminPrevNum.value = (uiPrevNum.innerText !== '-' ? uiPrevNum.innerText : '');
            if (adminPrevMeta && uiPrevMeta) adminPrevMeta.value = uiPrevMeta.innerText || '';
            if (adminTodayNum && uiTodayNum) adminTodayNum.value = (uiTodayNum.innerText !== '-' ? uiTodayNum.innerText : '');
            if (adminTodayMeta && uiTodayMeta) adminTodayMeta.value = uiTodayMeta.innerText || '';

            // Populate Yesterday Results from DOM
            const fields = ['morning', 'day', 'evening', 'night'];
            fields.forEach(f => {
                const uiEl = document.getElementById('ui-yesterday-' + f);
                const adminEl = document.getElementById('admin-yesterday-' + f);
                if (adminEl && uiEl) adminEl.value = (uiEl.innerText !== '---' ? uiEl.innerText : '');
            });

            // Populate Market Settings from DOM
            const uiMarketName = document.getElementById('ui-market-name');
            const uiMarketOpen = document.getElementById('ui-market-open');
            const uiMarketClose = document.getElementById('ui-market-close');
            const adminMarketName = document.getElementById('admin-market-name');
            const adminMarketOpen = document.getElementById('admin-market-open');
            const adminMarketClose = document.getElementById('admin-market-close');
            if (adminMarketName && uiMarketName) adminMarketName.value = uiMarketName.innerText.replace(/\s*star\s*/i, '').trim() || '';
            if (adminMarketOpen && uiMarketOpen) adminMarketOpen.value = uiMarketOpen.innerText || '';
            if (adminMarketClose && uiMarketClose) adminMarketClose.value = uiMarketClose.innerText || '';

            // Populate Weekly & Hot Settings from site_content cache
            getSiteContent().then(content => {
                if(content) {
                    const overrides = content.weekly_override || {};
                    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                    days.forEach((d, i) => {
                        const el = document.getElementById('admin-wg-' + d);
                        if(el) el.value = overrides[dayNames[i]] || '';
                    });
                    
                    const adminHotRange = document.getElementById('admin-hot-range');
                    if(adminHotRange && content.hot_numbers_range) {
                        adminHotRange.value = content.hot_numbers_range;
                    }
                    const adminHotAuto = document.getElementById('admin-hot-auto');
                    if(adminHotAuto) {
                        adminHotAuto.checked = content.hot_numbers_auto === true;
                    }
                    if (window.initAdminHotNumbersState) {
                        window.initAdminHotNumbersState(content.pinned_hot_numbers);
                    }
                }
            });
        });

        if (adminModalClose) {
            adminModalClose.addEventListener('click', () => {
                adminPanelModal.classList.add('hidden');
            });
        }
        
        adminPanelModal.addEventListener('click', (e) => {
            if (e.target === adminPanelModal) {
                adminPanelModal.classList.add('hidden');
            }
        });
    }

    if (adminCmsForm) {
        adminCmsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            toggleLoading(btnAdminSave, true);

            try {
                const { error } = await supabase
                    .from('site_content')
                    .update({
                        previous_number: adminPrevNum.value,
                        previous_lucky_meta: adminPrevMeta.value,
                        today_number: adminTodayNum.value,
                        today_lucky_meta: adminTodayMeta.value
                    })
                    .eq('id', 1);

                if (error) throw error;

                // Auto-archive: ONLY upsert today's number for today
                const ist = getISTDate();
                const todayStr = formatDateISO(ist);
                
                // Also auto-archive previous day's number for yesterday
                const yesterday = new Date(ist);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = formatDateISO(yesterday);

                if (adminTodayNum.value) {
                    await supabase
                        .from('historical_results')
                        .upsert({ result_date: todayStr, lucky_number: adminTodayNum.value }, { onConflict: 'result_date' });
                }
                
                if (adminPrevNum.value) {
                    await supabase
                        .from('historical_results')
                        .upsert(
                            { result_date: yesterdayStr, lucky_number: adminPrevNum.value },
                            { onConflict: 'result_date', ignoreDuplicates: true }
                        );
                }
                
                if(adminUpdateSuccess) adminUpdateSuccess.classList.remove('hidden');
                
                // Refresh UI immediately
                fetchSiteContent();
                fetchHistoricalResults();
                renderWeeklyGrid();
                renderHotNumbers();
                
            } catch (error) {
                showError(adminUpdateError, error.message);
            } finally {
                toggleLoading(btnAdminSave, false);
            }
        });
    }

    // Manual Historical Override Form
    const adminHistoryForm = document.getElementById('admin-history-form');
    const adminHistoryDate = document.getElementById('admin-history-date');
    const adminHistoryNumber = document.getElementById('admin-history-number');
    const btnAdminHistorySave = document.getElementById('btn-admin-history-save');
    const adminHistoryError = document.getElementById('admin-history-error');
    const adminHistorySuccess = document.getElementById('admin-history-success');

    if (adminHistoryForm) {
        adminHistoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError(adminHistoryError);
            if (adminHistorySuccess) adminHistorySuccess.classList.add('hidden');
            toggleLoading(btnAdminHistorySave, true);

            try {
                const { error } = await supabase
                    .from('historical_results')
                    .upsert({
                        result_date: adminHistoryDate.value,
                        lucky_number: adminHistoryNumber.value
                    }, { onConflict: 'result_date' });

                if (error) throw error;

                if (adminHistorySuccess) adminHistorySuccess.classList.remove('hidden');
                adminHistoryDate.value = '';
                adminHistoryNumber.value = '';

                // Refresh both public and admin lists, and charts
                fetchHistoricalResults();
                fetchAdminManageHistory();
                renderWeeklyGrid();
                renderHotNumbers();
            } catch (error) {
                showError(adminHistoryError, error.message);
            } finally {
                toggleLoading(btnAdminHistorySave, false);
            }
        });
    }

    // Manage Historical Results (Admin CMS)
    let adminManagePage = 0;
    const ADMIN_MANAGE_PAGE_SIZE = 15;
    let adminManageFilterDate = null;
    const adminManageDeleteSuccess = document.getElementById('admin-manage-delete-success');

    const fetchAdminManageHistory = async (append = false) => {
        const tbody = document.getElementById('admin-manage-history-body');
        const loadMoreBtn = document.getElementById('btn-admin-manage-load-more');
        if (!tbody) return;

        if (!append) {
            adminManagePage = 0;
            tbody.innerHTML = '<tr><td colspan="3" class="td-center td-muted" style="padding: 24px;">Loading...</td></tr>';
        }

        try {
            let query = supabase
                .from('historical_results')
                .select('*')
                .order('result_date', { ascending: false });

            if (adminManageFilterDate) {
                query = query.eq('result_date', adminManageFilterDate);
            }

            const from = adminManagePage * ADMIN_MANAGE_PAGE_SIZE;
            const to = from + ADMIN_MANAGE_PAGE_SIZE - 1;
            query = query.range(from, to);

            const { data, error } = await query;
            if (error) throw error;

            if (!append) tbody.innerHTML = '';

            if (data && data.length > 0) {
                data.forEach((row) => {
                    const tr = document.createElement('tr');
                    const dateObj = new Date(row.result_date + 'T00:00:00');
                    const dateStr = dateObj.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
                    tr.innerHTML = `
                        <td class="font-medium">${dateStr}</td>
                        <td class="font-data-cell">${row.lucky_number || '---'}</td>
                        <td class="td-center">
                            <button class="btn-delete-sm" data-date="${row.result_date}" data-display="${dateStr}">
                                <span class="material-symbols-outlined">delete</span>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });

                // Attach delete handlers
                tbody.querySelectorAll('.btn-delete-sm').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const resultDate = btn.getAttribute('data-date');
                        const displayDate = btn.getAttribute('data-display');
                        handleDeleteHistoryRecord(resultDate, displayDate);
                    });
                });

                if (loadMoreBtn) {
                    loadMoreBtn.classList.toggle('hidden', data.length < ADMIN_MANAGE_PAGE_SIZE || !!adminManageFilterDate);
                }
            } else if (!append) {
                tbody.innerHTML = '<tr><td colspan="3" class="td-center td-muted" style="padding: 24px;">No records found.</td></tr>';
                if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error fetching admin manage history:', error);
        }
    };

    // Delete handler with confirmation
    const handleDeleteHistoryRecord = async (resultDate, displayDate) => {
        const confirmed = confirm(`Are you sure you want to delete the result for ${displayDate}?`);
        if (!confirmed) return;

        if (adminManageDeleteSuccess) adminManageDeleteSuccess.classList.add('hidden');

        try {
            const { error } = await supabase
                .from('historical_results')
                .delete()
                .eq('result_date', resultDate);

            if (error) throw error;

            if (adminManageDeleteSuccess) adminManageDeleteSuccess.classList.remove('hidden');

            // Re-fetch both admin manage list, public historical table, and charts
            fetchAdminManageHistory();
            fetchHistoricalResults();
            renderWeeklyGrid();
            renderHotNumbers();
        } catch (error) {
            console.error('Error deleting history record:', error);
            alert('Failed to delete record: ' + error.message);
        }
    };

    // Admin manage search/filter
    const btnAdminManageSearch = document.getElementById('btn-admin-manage-search');
    const btnAdminManageClear = document.getElementById('btn-admin-manage-clear');
    const adminManageDateInput = document.getElementById('admin-manage-date-filter');

    if (btnAdminManageSearch && adminManageDateInput) {
        btnAdminManageSearch.addEventListener('click', () => {
            const val = adminManageDateInput.value;
            if (val) {
                adminManageFilterDate = val;
                fetchAdminManageHistory();
                if (btnAdminManageClear) btnAdminManageClear.classList.remove('hidden');
            }
        });
    }
    if (btnAdminManageClear && adminManageDateInput) {
        btnAdminManageClear.addEventListener('click', () => {
            adminManageFilterDate = null;
            adminManageDateInput.value = '';
            btnAdminManageClear.classList.add('hidden');
            fetchAdminManageHistory();
        });
    }

    const adminManageLoadMore = document.getElementById('btn-admin-manage-load-more');
    if (adminManageLoadMore) {
        adminManageLoadMore.addEventListener('click', () => {
            adminManagePage++;
            fetchAdminManageHistory(true);
        });
    }

    // Load admin manage list when CMS modal opens (augment existing open handler)
    const originalAdminBtn = document.getElementById('btn-admin-panel');
    if (originalAdminBtn) {
        originalAdminBtn.addEventListener('click', () => {
            fetchAdminManageHistory();
            if (adminManageDeleteSuccess) adminManageDeleteSuccess.classList.add('hidden');
        });
    }

    // Accordion Toggle Logic
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-accordion');
            const body = document.getElementById(targetId);
            if (!body) return;

            const isOpen = body.classList.contains('open');
            if (isOpen) {
                body.classList.remove('open');
                header.classList.remove('active');
            } else {
                body.classList.add('open');
                header.classList.add('active');
            }
        });
    });

    // Save Yesterday Results
    const btnSaveYesterday = document.getElementById('btn-admin-save-yesterday');
    if (btnSaveYesterday) {
        btnSaveYesterday.addEventListener('click', async () => {
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            toggleLoading(btnSaveYesterday, true);

            try {
                const { error } = await supabase
                    .from('site_content')
                    .update({
                        yesterday_morning: document.getElementById('admin-yesterday-morning')?.value || '',
                        yesterday_day: document.getElementById('admin-yesterday-day')?.value || '',
                        yesterday_evening: document.getElementById('admin-yesterday-evening')?.value || '',
                        yesterday_night: document.getElementById('admin-yesterday-night')?.value || ''
                    })
                    .eq('id', 1);

                if (error) throw error;
                if(adminUpdateSuccess) adminUpdateSuccess.classList.remove('hidden');
                fetchSiteContent();
            } catch (error) {
                showError(adminUpdateError, error.message);
            } finally {
                toggleLoading(btnSaveYesterday, false);
            }
        });
    }

    // Save Market Settings
    const btnSaveMarket = document.getElementById('btn-admin-save-market');
    if (btnSaveMarket) {
        btnSaveMarket.addEventListener('click', async () => {
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            toggleLoading(btnSaveMarket, true);

            try {
                const { error } = await supabase
                    .from('site_content')
                    .update({
                        market_name: document.getElementById('admin-market-name')?.value || '',
                        market_open_time: document.getElementById('admin-market-open')?.value || '',
                        market_close_time: document.getElementById('admin-market-close')?.value || ''
                    })
                    .eq('id', 1);

                if (error) throw error;
                if(adminUpdateSuccess) adminUpdateSuccess.classList.remove('hidden');
                fetchSiteContent();
            } catch (error) {
                showError(adminUpdateError, error.message);
            } finally {
                toggleLoading(btnSaveMarket, false);
            }
        });
    }

    // Save Weekly Grid Overrides
    const btnSaveWeekly = document.getElementById('btn-admin-save-weekly');
    if (btnSaveWeekly) {
        btnSaveWeekly.addEventListener('click', async () => {
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            toggleLoading(btnSaveWeekly, true);
            
            const weekly_override = {
                'Monday': document.getElementById('admin-wg-mon')?.value || '',
                'Tuesday': document.getElementById('admin-wg-tue')?.value || '',
                'Wednesday': document.getElementById('admin-wg-wed')?.value || '',
                'Thursday': document.getElementById('admin-wg-thu')?.value || '',
                'Friday': document.getElementById('admin-wg-fri')?.value || '',
                'Saturday': document.getElementById('admin-wg-sat')?.value || '',
                'Sunday': document.getElementById('admin-wg-sun')?.value || ''
            };

            try {
                const { error } = await supabase
                    .from('site_content')
                    .update({ weekly_override })
                    .eq('id', 1);

                if (error) throw error;
                siteContentCache = null; // force clear cache
                if(adminUpdateSuccess) adminUpdateSuccess.classList.remove('hidden');
                renderWeeklyGrid();
            } catch (error) {
                showError(adminUpdateError, error.message);
            } finally {
                toggleLoading(btnSaveWeekly, false);
            }
        });
    }

    // --- Admin CMS Hot Numbers State & Save ---
    let adminPinnedNumbers = [];
    const adminPinnedList = document.getElementById('admin-pinned-list');
    const adminPinInput = document.getElementById('admin-pin-input');
    const btnAdminPinAdd = document.getElementById('btn-admin-pin-add');
    const adminHotPreview = document.getElementById('admin-hot-preview');
    const adminHotRange = document.getElementById('admin-hot-range');

    const renderAdminPinnedList = () => {
        if (!adminPinnedList) return;
        adminPinnedList.innerHTML = '';
        if (adminPinnedNumbers.length === 0) {
            adminPinnedList.innerHTML = '<span class="td-muted text-xs">No pinned numbers.</span>';
            return;
        }
        adminPinnedNumbers.forEach((pin, index) => {
            const div = document.createElement('div');
            div.className = 'hot-list-item pinned';
            div.innerHTML = `
                <div class="hot-list-left">
                    <span class="hot-list-val text-sm">${pin}</span>
                </div>
                <button type="button" class="btn-delete-pin" data-index="${index}">
                    <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                </button>
            `;
            adminPinnedList.appendChild(div);
        });

        // Add delete listeners
        adminPinnedList.querySelectorAll('.btn-delete-pin').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                adminPinnedNumbers.splice(idx, 1);
                renderAdminPinnedList();
                renderAdminHotPreview(); // Re-render preview to remove from excluded
            });
        });
    };

    const renderAdminHotPreview = async () => {
        if (!adminHotPreview) return;
        const rangeVal = adminHotRange ? adminHotRange.value : '7';
        adminHotPreview.innerHTML = 'Loading preview...';
        try {
            const topNumbers = await getHotNumbersData(rangeVal);
            const filtered = topNumbers.filter(item => !adminPinnedNumbers.includes(item.val)).slice(0, 5);
            
            if (filtered.length === 0) {
                adminHotPreview.innerHTML = 'No auto-detected numbers available.';
                return;
            }

            adminHotPreview.innerHTML = '';
            filtered.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'hot-list-item';
                div.style.padding = '6px 8px';
                div.innerHTML = `
                    <div class="hot-list-left">
                        <span class="hot-list-rank">#${index + 1}</span>
                        <span class="hot-list-val text-sm">${item.val}</span>
                    </div>
                    <span class="hot-list-freq text-xs">${item.freq}x</span>
                `;
                adminHotPreview.appendChild(div);
            });
        } catch (e) {
            adminHotPreview.innerHTML = 'Failed to load preview.';
        }
    };

    if (btnAdminPinAdd && adminPinInput) {
        btnAdminPinAdd.addEventListener('click', () => {
            const val = adminPinInput.value.trim();
            if (val && !adminPinnedNumbers.includes(val)) {
                adminPinnedNumbers.push(val);
                adminPinInput.value = '';
                renderAdminPinnedList();
                renderAdminHotPreview();
            }
        });
    }

    if (adminHotRange) {
        adminHotRange.addEventListener('change', renderAdminHotPreview);
    }

    // Expose a global hook for modal open to init state
    window.initAdminHotNumbersState = (pinnedArr) => {
        adminPinnedNumbers = [...(pinnedArr || [])];
        renderAdminPinnedList();
        renderAdminHotPreview();
    };

    const btnSaveHot = document.getElementById('btn-admin-save-hot');
    if (btnSaveHot) {
        btnSaveHot.addEventListener('click', async () => {
            hideError(adminUpdateError);
            if(adminUpdateSuccess) adminUpdateSuccess.classList.add('hidden');
            toggleLoading(btnSaveHot, true);

            try {
                const rangeVal = adminHotRange?.value || '7';
                const autoVal = document.getElementById('admin-hot-auto')?.checked || false;
                
                const { error } = await supabase
                    .from('site_content')
                    .update({
                        hot_numbers_range: rangeVal,
                        hot_numbers_auto: autoVal,
                        pinned_hot_numbers: adminPinnedNumbers
                    })
                    .eq('id', 1);

                if (error) throw error;
                siteContentCache = null; // force clear cache
                if(adminUpdateSuccess) adminUpdateSuccess.classList.remove('hidden');
                
                // Update UI selector if settings changed
                if(hotNumbersRange) hotNumbersRange.value = rangeVal;
                
                renderHotNumbers();
            } catch (error) {
                showError(adminUpdateError, error.message);
            } finally {
                toggleLoading(btnSaveHot, false);
            }
        });
    }

    // Scroll Pop Animation Observer
    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optional: unobserve if you only want it to pop once
                scrollObserver.unobserve(entry.target); 
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
    
    document.querySelectorAll('.scroll-pop').forEach(el => {
        scrollObserver.observe(el);
    });
});

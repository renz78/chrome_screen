// background.js - Service Worker для розширення Chrome з використанням chrome.alarms

let autoScreenshotSettings = {
    enabled: false,
    interval: 60, // секунди
    uploadUrl: ''
};

const ALARM_NAME = 'autoScreenshot';

// Ініціалізація при запуску
chrome.runtime.onStartup.addListener(initializeAutoScreenshot);
chrome.runtime.onInstalled.addListener(initializeAutoScreenshot);

async function initializeAutoScreenshot() {
    try {
        const result = await chrome.storage.sync.get(['autoCapture', 'captureInterval', 'uploadUrl']);
        
        console.log('Завантажені налаштування:', result);
        
        if (result.autoCapture && result.uploadUrl) {
            autoScreenshotSettings = {
                enabled: result.autoCapture,
                interval: result.captureInterval || 60,
                uploadUrl: result.uploadUrl
            };
            
            console.log('Налаштування автоскріншотів:', autoScreenshotSettings);
            
            if (autoScreenshotSettings.enabled) {
                await startAutoScreenshot();
            }
        }
    } catch (error) {
        console.error('Помилка ініціалізації:', error);
    }
}

// Обробник повідомлень
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Отримано повідомлення:', request);
    
    if (request.action === 'captureScreen') {
        captureAndUpload(request.uploadUrl)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'toggleAutoCapture') {
        handleToggleAutoCapture(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'updateInterval') {
        handleUpdateInterval(request)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'quickScreenshot') {
        if (autoScreenshotSettings.uploadUrl) {
            captureAndUpload(autoScreenshotSettings.uploadUrl)
                .then(result => console.log('Швидкий скріншот:', result))
                .catch(error => console.error('Помилка швидкого скріншота:', error));
        }
        return true;
    }
    
    if (request.action === 'testAutoScreenshot') {
        chrome.alarms.get(ALARM_NAME, (alarm) => {
            sendResponse({
                settings: autoScreenshotSettings,
                alarmActive: !!alarm,
                alarmInfo: alarm
            });
        });
        return true;
    }
});

async function handleToggleAutoCapture(request) {
    autoScreenshotSettings.enabled = request.enabled;
    autoScreenshotSettings.interval = request.interval;
    autoScreenshotSettings.uploadUrl = request.uploadUrl;
    
    console.log('Перемикання автоскріншотів:', autoScreenshotSettings);
    
    if (request.enabled && request.uploadUrl) {
        await startAutoScreenshot();
        return {success: true, message: 'Автоматичні скріншоти увімкнено'};
    } else {
        await stopAutoScreenshot();
        return {success: true, message: 'Автоматичні скріншоти вимкнено'};
    }
}

async function handleUpdateInterval(request) {
    autoScreenshotSettings.interval = request.interval;
    console.log('Оновлення інтервалу:', request.interval);
    
    if (autoScreenshotSettings.enabled) {
        await stopAutoScreenshot();
        await startAutoScreenshot();
    }
    return {success: true};
}

async function startAutoScreenshot() {
    try {
        // Спочатку зупиняємо попередній alarm
        await stopAutoScreenshot();
        
        if (!autoScreenshotSettings.uploadUrl) {
            console.error('URL для відправки не встановлено');
            return;
        }
        
        console.log(`Запуск автоматичних скріншотів кожні ${autoScreenshotSettings.interval} секунд`);
        
        // Створюємо alarm для періодичного виконання
        await chrome.alarms.create(ALARM_NAME, {
            delayInMinutes: autoScreenshotSettings.interval / 60,
            periodInMinutes: autoScreenshotSettings.interval / 60
        });
        
        console.log('Alarm створено успішно');
        
        // Створюємо перший скріншот відразу
        setTimeout(async () => {
            try {
                console.log('Створення початкового автоматичного скріншота...');
                await performAutoScreenshot();
            } catch (error) {
                console.error('Помилка початкового скріншота:', error);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Помилка запуску автоскріншотів:', error);
    }
}

async function stopAutoScreenshot() {
    return new Promise((resolve) => {
        chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
            if (wasCleared) {
                console.log('Автоматичні скріншоти зупинено');
            }
            resolve();
        });
    });
}

// Обробник alarm'ів
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('Alarm спрацював:', alarm);
        await performAutoScreenshot();
    }
});

async function performAutoScreenshot() {
    try {
        if (!autoScreenshotSettings.enabled || !autoScreenshotSettings.uploadUrl) {
            console.log('Автоскріншоти вимкнені або URL не встановлено');
            return;
        }
        
        console.log('Створення автоматичного скріншота...');
        const result = await captureAndUpload(autoScreenshotSettings.uploadUrl);
        
        if (result.success) {
            console.log('Автоматичний скріншот успішно відправлено');
            
            // Показуємо нотифікацію
            try {
                await chrome.notifications.create({
                    type: 'basic',
                    iconUrl: '/icon.png',
                    title: 'Screenshot Sender',
                    message: 'Скріншот автоматично відправлено'
                });
            } catch (notifError) {
                // Створюємо нотифікацію з data URL іконкою якщо звичайна не працює
                try {
                    await chrome.notifications.create({
                        type: 'basic',
                        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                        title: 'Screenshot Sender',
                        message: 'Скріншот автоматично відправлено'
                    });
                } catch (e) {
                    console.log('Нотифікації недоступні:', e);
                }
            }
        } else {
            console.error('Помилка автоматичного скріншота:', result.error);
        }
    } catch (error) {
        console.error('Помилка при автоматичному скріншоті:', error);
    }
}

async function captureAndUpload(uploadUrl) {
    try {
        // Отримуємо всі вкладки поточного вікна
        const tabs = await chrome.tabs.query({currentWindow: true});
        
        if (tabs.length === 0) {
            throw new Error('Не вдалося знайти вкладки');
        }
        
        // Знаходимо активну вкладку або беремо першу доступну
        let activeTab = tabs.find(tab => tab.active);
        if (!activeTab) {
            activeTab = tabs.find(tab => tab.url && !tab.url.startsWith('chrome://'));
            if (!activeTab) {
                activeTab = tabs[0];
            }
        }
        
        console.log('Створення скріншота для вкладки:', activeTab.title);

        // Перевіряємо чи можемо зробити скріншот цієї вкладки
        if (activeTab.url && activeTab.url.startsWith('chrome://')) {
            throw new Error('Неможливо зробити скріншот системної сторінки Chrome');
        }

        // Робимо скріншот видимої області
        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
            format: 'png',
            quality: 90
        });

        if (!dataUrl) {
            throw new Error('Не вдалося створити скріншот');
        }

        // Конвертуємо dataUrl в blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        if (blob.size === 0) {
            throw new Error('Створений скріншот порожній');
        }

        console.log('Розмір скріншота:', blob.size, 'байт');

        // Відправляємо на сервер
        const uploadResult = await uploadScreenshot(blob, uploadUrl, activeTab);
        
        return {success: true, data: uploadResult};
        
    } catch (error) {
        console.error('Помилка при створенні скріншота:', error);
        return {success: false, error: error.message};
    }
}

async function uploadScreenshot(blob, uploadUrl, tabInfo = null) {
    try {
        console.log('Відправка скріншота на:', uploadUrl);
        
        // Створюємо FormData
        const formData = new FormData();
        formData.append('screenshot', blob, `screenshot_${Date.now()}.png`);
        formData.append('timestamp', new Date().toISOString());
        
        // Додаємо інформацію про вкладку якщо є
        if (tabInfo) {
            formData.append('url', tabInfo.url || '');
            formData.append('title', tabInfo.title || '');
            formData.append('tabId', tabInfo.id ? tabInfo.id.toString() : '');
        }
        
        // Додаємо тип скріншота (перевіряємо чи це автоскріншот)
        chrome.alarms.get(ALARM_NAME, (alarm) => {
            formData.append('type', alarm ? 'auto' : 'manual');
        });
        
        formData.append('userAgent', navigator.userAgent);
        formData.append('extensionVersion', chrome.runtime.getManifest().version);

        // Відправляємо POST запит з timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Невідома помилка сервера');
            throw new Error(`HTTP помилка! статус: ${response.status}, відповідь: ${errorText}`);
        }

        const result = await response.text();
        console.log('Скріншот успішно відправлено. Відповідь сервера:', result);
        
        return result;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Час очікування відповіді від сервера вичерпано');
        }
        console.error('Помилка відправки:', error);
        throw new Error(`Не вдалося відправити скріншот: ${error.message}`);
    }
}

// Слухач змін в storage для синхронізації налаштувань
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        console.log('Зміни в storage:', changes);
        
        if (changes.autoCapture || changes.uploadUrl || changes.captureInterval) {
            initializeAutoScreenshot();
        }
    }
});

// Обробка пробудження розширення
chrome.runtime.onConnect.addListener((port) => {
    console.log('Розширення підключено');
});

// Додаємо обробник для керування stauts життєвого циклу
self.addEventListener('message', (event) => {
    console.log('Service Worker отримав повідомлення:', event.data);
});

console.log('Background script завантажено');
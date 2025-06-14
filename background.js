// background.js - Service Worker для розширення Chrome

let autoScreenshotTimer = null;
let autoScreenshotSettings = {
    enabled: false,
    interval: 60, // секунди
    uploadUrl: ''
};

// Ініціалізація при запуску
chrome.runtime.onStartup.addListener(initializeAutoScreenshot);
chrome.runtime.onInstalled.addListener(initializeAutoScreenshot);

async function initializeAutoScreenshot() {
    try {
        const result = await chrome.storage.sync.get(['autoCapture', 'captureInterval', 'uploadUrl']);
        
        if (result.autoCapture && result.uploadUrl) {
            autoScreenshotSettings = {
                enabled: result.autoCapture,
                interval: result.captureInterval || 60,
                uploadUrl: result.uploadUrl
            };
            
            if (autoScreenshotSettings.enabled) {
                startAutoScreenshot();
            }
        }
    } catch (error) {
        console.error('Помилка ініціалізації:', error);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureScreen') {
        captureAndUpload(request.uploadUrl)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
    
    if (request.action === 'toggleAutoCapture') {
        autoScreenshotSettings.enabled = request.enabled;
        autoScreenshotSettings.interval = request.interval;
        autoScreenshotSettings.uploadUrl = request.uploadUrl;
        
        if (request.enabled && request.uploadUrl) {
            startAutoScreenshot();
            sendResponse({success: true, message: 'Автоматичні скріншоти увімкнено'});
        } else {
            stopAutoScreenshot();
            sendResponse({success: true, message: 'Автоматичні скріншоти вимкнено'});
        }
        return true;
    }
    
    if (request.action === 'updateInterval') {
        autoScreenshotSettings.interval = request.interval;
        if (autoScreenshotSettings.enabled) {
            stopAutoScreenshot();
            startAutoScreenshot();
        }
        sendResponse({success: true});
        return true;
    }
});

function startAutoScreenshot() {
    stopAutoScreenshot(); // Зупиняємо попередній таймер якщо є
    
    if (!autoScreenshotSettings.uploadUrl) {
        console.error('URL для відправки не встановлено');
        return;
    }
    
    console.log(`Запуск автоматичних скріншотів кожні ${autoScreenshotSettings.interval} секунд`);
    
    autoScreenshotTimer = setInterval(async () => {
        try {
            console.log('Створення автоматичного скріншота...');
            const result = await captureAndUpload(autoScreenshotSettings.uploadUrl);
            
            if (result.success) {
                console.log('Автоматичний скріншот успішно відправлено');
                
                // Показуємо нотифікацію (опціонально)
                chrome.notifications?.create({
                    type: 'basic',
                    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
                    title: 'Screenshot Sender',
                    message: 'Скріншот автоматично відправлено'
                });
            } else {
                console.error('Помилка автоматичного скріншота:', result.error);
            }
        } catch (error) {
            console.error('Помилка при автоматичному скріншоті:', error);
        }
    }, autoScreenshotSettings.interval * 1000);
}

function stopAutoScreenshot() {
    if (autoScreenshotTimer) {
        clearInterval(autoScreenshotTimer);
        autoScreenshotTimer = null;
        console.log('Автоматичні скріншоти зупинено');
    }
}

async function captureAndUpload(uploadUrl) {
    try {
        // Отримуємо активну вкладку
        const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (!activeTab) {
            throw new Error('Не вдалося знайти активну вкладку');
        }

        // Робимо скріншот видимої області
        const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
            format: 'png',
            quality: 90
        });

        // Конвертуємо dataUrl в blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();

        // Відправляємо на сервер
        const uploadResult = await uploadScreenshot(blob, uploadUrl, activeTab);
        
        return {success: true, data: uploadResult};
        
    } catch (error) {
        console.error('Помилка при створенні скріншота:', error);
        throw error;
    }
}

async function uploadScreenshot(blob, uploadUrl, tabInfo = null) {
    try {
        // Створюємо FormData
        const formData = new FormData();
        formData.append('screenshot', blob, `screenshot_${Date.now()}.png`);
        formData.append('timestamp', new Date().toISOString());
        
        // Додаємо інформацію про вкладку якщо є
        if (tabInfo) {
            formData.append('url', tabInfo.url);
            formData.append('title', tabInfo.title);
            formData.append('tabId', tabInfo.id.toString());
        }
        
        // Додаємо тип скріншота
        formData.append('type', autoScreenshotTimer ? 'auto' : 'manual');

        // Відправляємо POST запит
        const response = await fetch(uploadUrl, {
            method: 'POST',
            body: formData,
            headers: {
                // Не встановлюємо Content-Type, браузер сам встановить для FormData
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP помилка! статус: ${response.status}`);
        }

        const result = await response.text();
        console.log('Скріншот успішно відправлено:', result);
        
        return result;
        
    } catch (error) {
        console.error('Помилка відправки:', error);
        throw new Error(`Не вдалося відправити скріншот: ${error.message}`);
    }
}

// Очищення при вимкненні розширення
chrome.runtime.onSuspend.addListener(() => {
    stopAutoScreenshot();
});

// Альтернативний метод для захоплення всього екрану (потребує додаткових дозволів)
async function captureFullScreen(uploadUrl) {
    try {
        // Запитуємо дозвіл на захоплення екрану
        const streamId = await new Promise((resolve, reject) => {
            chrome.desktopCapture.chooseDesktopMedia(['screen'], (streamId) => {
                if (streamId) {
                    resolve(streamId);
                } else {
                    reject(new Error('Користувач скасував захоплення екрану'));
                }
            });
        });

        // Отримуємо медіа потік
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            }
        });

        // Створюємо canvas для захоплення кадру
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        return new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                
                // Зупиняємо потік
                stream.getTracks().forEach(track => track.stop());
                
                // Конвертуємо в blob та відправляємо
                canvas.toBlob(async (blob) => {
                    try {
                        const result = await uploadScreenshot(blob, uploadUrl);
                        resolve({success: true, data: result});
                    } catch (error) {
                        reject(error);
                    }
                }, 'image/png');
            };
        });
        
    } catch (error) {
        console.error('Помилка захоплення екрану:', error);
        throw error;
    }
}
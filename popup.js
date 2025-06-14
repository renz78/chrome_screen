// popup.js - JavaScript код для popup інтерфейсу

document.addEventListener('DOMContentLoaded', function() {
    const captureBtn = document.getElementById('captureBtn');
    const urlInput = document.getElementById('urlInput');
    const status = document.getElementById('status');
    const autoCapture = document.getElementById('autoCapture');
    const intervalSelect = document.getElementById('intervalSelect');
    const autoStatus = document.getElementById('autoStatus');

    console.log('Popup завантажено');

    // Завантажити збережені налаштування
    chrome.storage.sync.get(['uploadUrl', 'autoCapture', 'captureInterval'], function(result) {
        console.log('Завантажені налаштування:', result);
        
        if (result.uploadUrl) {
            urlInput.value = result.uploadUrl;
        }
        if (result.autoCapture !== undefined) {
            autoCapture.checked = result.autoCapture;
        }
        if (result.captureInterval) {
            intervalSelect.value = result.captureInterval;
        }
        updateAutoStatus();
        
        // Тестуємо стан автоскріншотів
        chrome.runtime.sendMessage({action: 'testAutoScreenshot'}, (response) => {
            if (response) {
                console.log('Стан автоскріншотів:', response);
                if (response.alarmActive) {
                    console.log('Alarm активний:', response.alarmInfo);
                } else {
                    console.log('Alarm не активний');
                }
            }
        });
    });

    // Зберегти URL при зміні
    urlInput.addEventListener('change', function() {
        const url = urlInput.value.trim();
        console.log('Збереження URL:', url);
        chrome.storage.sync.set({uploadUrl: url});
        
        // Якщо автоскріншоти увімкнені, оновлюємо їх
        if (autoCapture.checked && url) {
            chrome.runtime.sendMessage({
                action: 'toggleAutoCapture',
                enabled: true,
                interval: parseInt(intervalSelect.value),
                uploadUrl: url
            }, (response) => {
                console.log('Відповідь на оновлення URL:', response);
            });
        }
    });

    // Обробка автоматичного режиму
    autoCapture.addEventListener('change', function() {
        const isEnabled = autoCapture.checked;
        const url = urlInput.value.trim();
        const interval = parseInt(intervalSelect.value);
        
        console.log('Зміна автоскріншотів:', {isEnabled, url, interval});
        
        if (isEnabled && !url) {
            showStatus('Спочатку введіть URL для відправки', 'error');
            autoCapture.checked = false;
            return;
        }
        
        chrome.storage.sync.set({autoCapture: isEnabled}, () => {
            console.log('Збережено autoCapture:', isEnabled);
        });
        
        // Відправити повідомлення до background script
        chrome.runtime.sendMessage({
            action: 'toggleAutoCapture',
            enabled: isEnabled,
            interval: interval,
            uploadUrl: url
        }, (response) => {
            console.log('Відповідь на toggleAutoCapture:', response);
            if (response) {
                if (response.success) {
                    showStatus(response.message, 'success');
                } else {
                    showStatus(response.error || 'Помилка налаштування', 'error');
                }
            }
        });
        
        updateAutoStatus();
    });

    // Зміна інтервалу
    intervalSelect.addEventListener('change', function() {
        const interval = parseInt(intervalSelect.value);
        console.log('Зміна інтервалу:', interval);
        
        chrome.storage.sync.set({captureInterval: interval}, () => {
            console.log('Збережено captureInterval:', interval);
        });
        
        if (autoCapture.checked) {
            chrome.runtime.sendMessage({
                action: 'updateInterval',
                interval: interval
            }, (response) => {
                console.log('Відповідь на updateInterval:', response);
            });
        }
        
        updateAutoStatus();
    });

    captureBtn.addEventListener('click', function() {
        const url = urlInput.value.trim();
        
        console.log('Натиснуто кнопку скріншота, URL:', url);
        
        if (!url) {
            showStatus('Будь ласка, введіть URL для відправки', 'error');
            return;
        }

        if (!isValidUrl(url)) {
            showStatus('Будь ласка, введіть правильний URL', 'error');
            return;
        }

        captureBtn.disabled = true;
        captureBtn.textContent = 'Обробка...';
        
        // Зберігаємо URL перед використанням
        chrome.storage.sync.set({uploadUrl: url});
        
        // Відправити повідомлення до background script
        chrome.runtime.sendMessage({
            action: 'captureScreen',
            uploadUrl: url
        }, function(response) {
            console.log('Відповідь на captureScreen:', response);
            
            captureBtn.disabled = false;
            captureBtn.textContent = 'Зробити скріншот';
            
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                showStatus('Помилка з\'єднання з розширенням', 'error');
                return;
            }
            
            if (response && response.success) {
                showStatus('Скріншот успішно відправлено!', 'success');
            } else {
                const errorMsg = response?.error || 'Невідома помилка';
                showStatus('Помилка: ' + errorMsg, 'error');
            }
        });
    });

    function updateAutoStatus() {
        if (autoCapture.checked) {
            const interval = parseInt(intervalSelect.value);
            let timeText = getTimeText(interval);
            
            autoStatus.textContent = `✅ Автоматичні скріншоти ${timeText}`;
            autoStatus.style.color = '#28a745';
        } else {
            autoStatus.textContent = '⏸️ Автоматичні скріншоти вимкнено';
            autoStatus.style.color = '#666';
        }
    }
    
    function getTimeText(seconds) {
        if (seconds < 60) {
            return `кожні ${seconds} секунд`;
        }
        
        const minutes = seconds / 60;
        if (minutes < 60) {
            if (minutes === 1) return 'кожну хвилину';
            if (minutes <= 4) return `кожні ${minutes} хвилини`;
            return `кожні ${minutes} хвилин`;
        }
        
        const hours = minutes / 60;
        if (hours === 1) return 'кожну годину';
        return `кожні ${hours} годин`;
    }

    function showStatus(message, type) {
        console.log('Показ статусу:', message, type);
        status.textContent = message;
        status.className = 'status ' + type;
        status.style.display = 'block';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return string.startsWith('http://') || string.startsWith('https://');
        } catch (_) {
            return false;
        }
    }
    
    // Додаємо тестову кнопку для дебагу (тимчасово)
    const testBtn = document.createElement('button');
    testBtn.textContent = 'Тест автоскріншотів';
    testBtn.style.marginTop = '10px';
    testBtn.style.fontSize = '12px';
    testBtn.style.padding = '5px';
    testBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({action: 'testAutoScreenshot'}, (response) => {
            console.log('Тест результат:', response);
            if (response) {
                const alarmStatus = response.alarmActive ? 'Активний' : 'Неактивний';
                const nextAlarm = response.alarmInfo ? new Date(response.alarmInfo.scheduledTime).toLocaleTimeString() : 'Невідомо';
                alert(`Налаштування: ${JSON.stringify(response.settings)}\nAlarm: ${alarmStatus}\nНаступний скріншот: ${nextAlarm}`);
            }
        });
    });
    
    // Додаємо тестову кнопку до контейнера (розкоментуйте для дебагу)
    document.querySelector('.container').appendChild(testBtn);
});
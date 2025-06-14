// popup.js - JavaScript код для popup інтерфейсу

document.addEventListener('DOMContentLoaded', function() {
    const captureBtn = document.getElementById('captureBtn');
    const urlInput = document.getElementById('urlInput');
    const status = document.getElementById('status');
    const autoCapture = document.getElementById('autoCapture');
    const intervalSelect = document.getElementById('intervalSelect');
    const autoStatus = document.getElementById('autoStatus');

    // Завантажити збережені налаштування
    chrome.storage.sync.get(['uploadUrl', 'autoCapture', 'captureInterval'], function(result) {
        if (result.uploadUrl) {
            urlInput.value = result.uploadUrl;
        }
        if (result.autoCapture) {
            autoCapture.checked = result.autoCapture;
        }
        if (result.captureInterval) {
            intervalSelect.value = result.captureInterval;
        }
        updateAutoStatus();
    });

    // Зберегти URL при зміні
    urlInput.addEventListener('change', function() {
        chrome.storage.sync.set({uploadUrl: urlInput.value});
    });

    // Обробка автоматичного режиму
    autoCapture.addEventListener('change', function() {
        const isEnabled = autoCapture.checked;
        chrome.storage.sync.set({autoCapture: isEnabled});
        
        // Відправити повідомлення до background script
        chrome.runtime.sendMessage({
            action: 'toggleAutoCapture',
            enabled: isEnabled,
            interval: parseInt(intervalSelect.value),
            uploadUrl: urlInput.value.trim()
        });
        
        updateAutoStatus();
    });

    // Зміна інтервалу
    intervalSelect.addEventListener('change', function() {
        const interval = parseInt(intervalSelect.value);
        chrome.storage.sync.set({captureInterval: interval});
        
        if (autoCapture.checked) {
            chrome.runtime.sendMessage({
                action: 'updateInterval',
                interval: interval
            });
        }
        
        updateAutoStatus();
    });

    captureBtn.addEventListener('click', function() {
        const url = urlInput.value.trim();
        
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
        
        // Відправити повідомлення до background script
        chrome.runtime.sendMessage({
            action: 'captureScreen',
            uploadUrl: url
        }, function(response) {
            captureBtn.disabled = false;
            captureBtn.textContent = 'Зробити скріншот';
            
            if (response && response.success) {
                showStatus('Скріншот успішно відправлено!', 'success');
            } else {
                showStatus('Помилка: ' + (response?.error || 'Невідома помилка'), 'error');
            }
        });
    });

    function updateAutoStatus() {
        if (autoCapture.checked) {
            const interval = parseInt(intervalSelect.value);
            const minutes = interval / 60;
            let timeText;
            
            if (minutes < 60) {
                timeText = minutes === 1 ? 'хвилину' : `${minutes} хвилин`;
            } else {
                const hours = minutes / 60;
                timeText = hours === 1 ? 'годину' : `${hours} годин`;
            }
            
            autoStatus.textContent = `✅ Автоматичні скріншоти кожну ${timeText}`;
            autoStatus.style.color = '#28a745';
        } else {
            autoStatus.textContent = '⏸️ Автоматичні скріншоти вимкнено';
            autoStatus.style.color = '#666';
        }
    }

    function showStatus(message, type) {
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
            return true;
        } catch (_) {
            return false;
        }
    }
});
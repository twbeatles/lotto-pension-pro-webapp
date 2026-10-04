import { $ } from '../../../../utils/utils.js';

export const appSettingsProxySectionMethods = {
    renderSettingsProxySection() {
        if (typeof document === 'undefined') return;
        const proxyInput = $('#customProxyUrl');
        if (
            proxyInput &&
            document.activeElement !== proxyInput &&
            proxyInput.value !== (this.data.state.customProxy || '')
        ) {
            proxyInput.value = this.data.state.customProxy || '';
        }
        const proxyHelp = $('#customProxyHelp');
        const proxyStatus = $('#customProxyStatusNote');
        const savedProxyValidation = this.data.validateCustomProxyUrl(this.data.state.customProxy || '');
        const activeProxyConfig = this.data.resolveProxyConfig();
        if (proxyHelp) {
            proxyHelp.textContent = savedProxyValidation.empty
                ? '비워 두면 앱이 알아서 최신 당첨 번호를 받아옵니다. 직접 만든 연결 서버(Cloudflare Worker)가 있을 때만 입력하세요. 예: https://내서버.workers.dev/proxy/latest'
                : savedProxyValidation.valid
                  ? '입력한 연결 주소로 최신 당첨 번호를 받아옵니다.'
                  : '형식이 맞지 않는 주소는 무시하고 기본 연결을 사용합니다.';
        }
        if (proxyStatus) {
            let statusText = '';
            if (!savedProxyValidation.empty && !savedProxyValidation.valid) {
                statusText = `저장된 데이터 연결 주소를 사용하지 않습니다. ${savedProxyValidation.reason}`;
            } else if (activeProxyConfig?.invalid) {
                statusText = `${activeProxyConfig.source} 연결 형식이 지원되지 않아 기본 자동 동기화를 사용 중입니다.`;
            }
            proxyStatus.textContent = statusText;
            proxyStatus.style.display = statusText ? 'block' : 'none';
        }
    }
};

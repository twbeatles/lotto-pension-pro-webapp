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
                ? '비워두면 기본 자동 동기화를 사용합니다. 공식 API가 막히면 corsproxy.io 등 서드파티 CORS 프록시를 경유할 수 있습니다. 자체 Worker 배포를 권장합니다. 형식: https://<worker>.workers.dev/proxy/latest'
                : savedProxyValidation.valid
                  ? '사용 가능한 데이터 연결 주소가 저장되어 있습니다.'
                  : '지원되지 않는 연결 주소는 무시되고 기본 자동 동기화를 사용합니다.';
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

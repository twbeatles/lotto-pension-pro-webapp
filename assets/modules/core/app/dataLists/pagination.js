import { $ } from '../../../utils/utils.js';

export const appDataListPaginationMethods = {
    paginateItems(scope, items = []) {
        const state = this.getDataListState(scope);
        const totalItems = items.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / this.dataListPageSize));
        const page = Math.min(state.page, totalPages);
        state.page = page;
        const start = (page - 1) * this.dataListPageSize;
        return {
            items: items.slice(start, start + this.dataListPageSize),
            totalItems,
            totalPages,
            page
        };
    },

    renderPagination(containerSelector, scope, pageInfo) {
        const el = $(containerSelector);
        if (!el) return;
        const totalItems = Number(pageInfo?.totalItems || 0);
        if (!totalItems) {
            el.innerHTML = '';
            return;
        }

        const totalPages = Math.max(1, Number(pageInfo?.totalPages || 1));
        const page = Math.max(1, Number(pageInfo?.page || 1));
        const prevPage = Math.max(1, page - 1);
        const nextPage = Math.min(totalPages, page + 1);

        el.innerHTML = `
            <span class="pagination-summary">${pageInfo?.summaryText || `총 ${totalItems}개`}</span>
            <div class="pagination-actions">
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${prevPage}" ${page <= 1 ? 'disabled' : ''}>이전</button>
                <span class="pagination-page">${page} / ${totalPages}</span>
                <button class="btn ghost sm" data-page-scope="${scope}" data-page="${nextPage}" ${page >= totalPages ? 'disabled' : ''}>다음</button>
            </div>
        `;
    }
};

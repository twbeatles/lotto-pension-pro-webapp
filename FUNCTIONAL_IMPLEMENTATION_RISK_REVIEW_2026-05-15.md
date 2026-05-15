# 기능 구현 리스크 리뷰 및 후속 개선 상태 - 2026-05-15

## 대상

- 제품명: `로또·연금복권 프로`
- 저장소/패키지 기준 slug: `lotto-pension-pro-webapp`
- 검토 범위:
    - 로또 6/45 기존 흐름
    - 연금복권720+ 통계/추천/저장/당첨 확인 신규 흐름
    - 백업 v4, PWA 캐시, 데이터 상태, 문서와 `.gitignore`

## 결론

초기 리스크 리뷰에서 제안한 우선 개선 항목은 현재 코드 기준으로 구현되어 있습니다.

- 연금복권720+ 공식 endpoint 최신성 검증이 `npm run build`에 포함됨
- 저장한 연금복권 번호의 복사, 전체 복사, CSV 내보내기, 최신 회차 기준 참고 당첨 확인 추가
- 백업 v4에 `pension720Tickets` 포함
- 데이터 관리 페이지에 로또 6/45와 연금복권720+ 상태 요약 추가
- 서비스워커 캐시 버전과 precache manifest 갱신
- README, handoff 문서, 배포 문서가 새 제품명과 연금복권 기능 기준으로 정리됨
- `.gitignore`가 새 백업/CSV 파일명 prefix를 제외하도록 갱신됨

삭제 상태인 `FUNCTIONAL_GAP_AND_COPY_REVIEW_2026-05-04.md`, `FUNCTIONAL_IMPLEMENTATION_AUDIT_2026-04-30.md`는 현행 문서 계약에서 제외하며 복원하지 않습니다.

## 구현 완료 항목

### 1. 공식 데이터 검증

- `scripts/fetch_pension720_stats.mjs`가 공식 `selectPstPt720WnList.do` 응답을 정규화합니다.
- `--check`는 checked-in `data/pension720_stats.json` 자체 정합성을 확인합니다.
- `--check-online`은 공식 최신 데이터와 정적 JSON 최신 draw를 비교합니다.
- `npm run check:pension720:freshness`가 추가되었고 `npm run build`에 포함되었습니다.

운영 리스크:

- 공식 endpoint 장애 또는 네트워크 차단 시 build가 실패합니다. 이는 사용자가 선택한 정책입니다.

### 2. 연금복권720+ 추천 안정화

- `Pension720Engine`의 조별 점수는 smoothing 점수와 실제 출현 수를 분리합니다.
- UI와 추천 근거 문구는 사용자가 이해하기 쉬운 실제 출현 수(`rawCount`)를 표시합니다.
- 추천 결과 카드는 생성 당시 분석 강도 옵션을 보존합니다.
- 같은 6자리의 확장 조 저장은 저장 전후 key set 비교로 `inserted`, `duplicate`, `truncated`를 계산합니다.

운영 리스크:

- 연금복권720+ 추천은 통계 참고용입니다. 확률 독립성 때문에 당첨 가능성을 보장하지 않습니다.

### 3. 연금복권720+ 저장 목록 확장

- 개별 저장 번호 복사
- 전체 목록 복사
- CSV 내보내기
- 전체 정리 전 확인 다이얼로그
- 최신 회차 기준 참고 당첨 확인

당첨 확인 반환 shape:

```js
{
  drawNo,
  date,
  group,
  number,
  rank,
  label,
  prizeLabel,
  trailingMatches,
  matchType
}
```

운영 리스크:

- 저장 번호는 실제 구매 증빙이 아닙니다. UI와 문서에는 실물/공식 확인 필요 문구를 유지해야 합니다.
- QR/실물 티켓 기반 연금복권 검증은 이번 범위에 포함하지 않았습니다.

### 4. 백업 v4와 파일명

- 기본 백업 prefix: `lotto_pension_pro_backup_v4`
- 가져오기 overwrite 전 자동 백업 prefix: `lotto_pension_pro_before_replace`
- 데이터 정리 전 자동 백업 prefix: `lotto_pension_pro_before_cleanup`
- 연금복권720+ CSV prefix: `lotto_pension_pro_pension720_tickets`

`.gitignore`는 위 로컬 다운로드 산출물이 저장소에 섞이지 않도록 제외합니다.

### 5. 데이터 상태와 PWA

- 데이터 관리 페이지에 로또 6/45와 연금복권720+ 데이터 상태 요약을 표시합니다.
- 표시 항목:
    - source
    - 최신 회차
    - 마지막 확인 시각
    - local update 수
    - 저장 번호 수
    - endpoint 실패 메시지
- `data/pension720_stats.json`이 service worker precache manifest에 포함됩니다.
- `CACHE_VERSION`은 `v23` 기준입니다.

운영 리스크:

- 앱 shell, manifest, 데이터 파일, 서비스워커가 바뀌면 `npm run sync:sw-manifest`와 cache version 점검을 같이 해야 합니다.

## 문서 정합성 상태

- `README.md`: 현재 기능, 데이터, 백업, PWA, 개발/검증 명령 기준으로 정리됨
- `claude.md`: Claude-family agent handoff 기준으로 갱신됨
- `gemini.md`: Gemini-family agent handoff 기준으로 갱신됨
- `deploy_github_pages.md`: 새 Pages URL과 기존 PWA 사용자 전환 절차 반영
- `cladue.md`: 오타 파일명 compatibility alias로 유지
- `THIRD_PARTY_NOTICES.md`: vendored runtime asset 안내 유지

주의:

- 실제 GitHub repository rename은 코드 변경과 별개 운영 작업입니다.
- 현재 문서와 메타데이터는 `lotto-pension-pro-webapp` rename 완료를 전제로 합니다.

## 권장 검증 명령

```bash
npm run lint
npm run check:data-freshness
npm run check:pension720
npm run check:pension720:freshness
node scripts/smoke/smoke.mjs
npm run build
git diff --check
```

브라우저 검증:

```bash
python -m http.server 5173
npm run test:happy
npm run test:offline
npm run test:pwa-mobile
```

## 남은 운영 과제

- GitHub repository rename과 Pages source 확인
- 새 URL에서 기존 설치형 PWA 사용자의 백업/복원 안내 검증
- 다음 연금복권720+ 회차 공개 후 `npm run sync:pension720`와 build 재검증
- 추후 범위로 QR/실물 티켓 기반 연금복권 확인 기능 검토

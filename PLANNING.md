# Morning Briefing Bot Planning (Handoff Ready)

## 출근 브리핑 자동화 전환 진행 현황 (Timeline)

### 1) Git 스케줄 적용
- 초기에는 GitHub Actions `schedule(cron)` 기반으로 매일 아침 발송 구성
- `daily-briefing.yml`에서 정시 실행 + Slack 발송 흐름으로 운영 시작
- 목적: 별도 서버 없이 정기 브리핑 자동화

### 2) GitHub Actions 적용 및 설정
- Node 런타임/의존성 설치/브리핑 실행(`node index.mjs`) 워크플로우 구성
- 브리핑 환경변수(`BRIEFING_LAT/LON`, `BRIEFING_REGION_HINT`, `BRIEFING_WEATHER_TARGET_TIME`) 반영
- Slack Webhook 기반 자동 발송 적용
- 이후 운영 안정화를 위해 `workflow_dispatch` 중심 실행 경로로 정리

### 3) 스케줄 이슈 확인
- 증상: 정확히 07:30 KST에 Slack 메시지가 지연/누락되는 케이스 발생
- 원인 후보: GitHub Actions `schedule` 트리거 특성(혼잡 시 지연 가능)
- 참고: https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows

### 4) AWS Lambda + EventBridge로 해결 시도
- Lambda에서 GitHub `workflow_dispatch` API를 호출하도록 구성
- EventBridge Scheduler를 Lambda 타겟으로 연결하여 외부 스케줄링으로 전환
- 테스트 실행 성공: Lambda -> GitHub 워크플로우 트리거 확인
- 최종 방향: 스케줄링은 AWS, 실행은 GitHub Actions

### 5) 연동 완료 후 신규 이슈 발생
- 워크플로우 실행 중 `Proxy route health check` 단계에서 `403` 발생
- 증상: 날씨/미세먼지 조회가 `정보 확인 실패`로 fallback
- 원인: hosted proxy(`k-skill-proxy.nomadamas.org`) 접근/정책 이슈
- 조치:
  - `KSKILL_PROXY_BASE_URL` 하드코딩 제거
  - GitHub Secret 주입 방식으로 변경
  - health check/log 강화, 실패 요약 문구 개선
- 결론: 안정 운영을 위해 self-host proxy 필요

### 6) self-host Proxy 구축 및 전환 완료
- `k-skill-proxy` self-host 전환 결정
- 공공데이터 활용신청 후 upstream 키 준비:
  - `KMA_OPEN_API_KEY` (기상청)
  - `AIR_KOREA_OPEN_API_KEY` (에어코리아)
- AWS App Runner에 `k-skill-proxy` 배포 완료
- 핵심 환경변수 적용:
  - `KSKILL_PROXY_HOST=0.0.0.0`
  - `KSKILL_PROXY_PORT=8080`
  - `KMA_OPEN_API_KEY`
  - `AIR_KOREA_OPEN_API_KEY`
- 배포 URL 발급 후 health check 통과, Slack 출근 브리핑 정상 수신 확인

### 7) GitHub Actions 운영 설정 정리
- 워크플로우를 `workflow_dispatch` 중심으로 고정
- GitHub Secrets 연동 정리:
  - `SLACK_WEBHOOK_URL`
  - `KSKILL_PROXY_BASE_URL` (self-host URL)
  - `TWELVE_DATA_API_KEY`
- 사전 검증 스텝 구성:
  - `Validate required env`
  - `Proxy route health check`
- 효과: 실행 전에 필수값/프록시 라우트 이상을 즉시 탐지 가능

### 8) 출근 브리핑 날씨 로직 정확도 개선
- 고정 타깃 시각(`BRIEFING_WEATHER_TARGET_TIME`) 의존 제거
- 현재 시각(KST) 기준으로 가장 가까운 예보 시점을 자동 선택하도록 변경
- 효과: 실제 시점 체감과 더 맞는 날씨 노출
- 반영 커밋: `e5e3ebd`

### 9) 투자 브리핑 실데이터 연동
- placeholder 제거 후 실데이터 연동 완료
- 연동 항목:
  - 환율: 원/달러, 원/엔
  - 지수: S&P, 나스닥, 코스피
  - 원자재: WTI, 금
- Twelve Data 연동 + 호출량 제한(throttle) 반영
- 부분 실패 시 섹션 단위 fallback 처리(전체 메시지 실패 방지)
- 반영 커밋: `03d8713`

### 10) 투자 지표 매칭 정확도 보정
- 지수/원자재 심볼 매칭 보정 및 이상값 필터링 로직 강화
- S&P/나스닥/코스피/WTI/금 값 범위 검증 추가
- ETF/대체값으로 인한 왜곡 가능성 축소
- 반영 커밋: `60b3aac`

### 11) 현재 상태 / 남은 작업
- 현재 완료:
  - 출근 브리핑(날씨/미세먼지) 정상 동작
  - 투자 브리핑(환율/지수/원자재) 실데이터 동작
  - AWS 스케줄링 + GitHub 실행 하이브리드 구조 안정화
- 남은 작업:
  - 일정 브리핑(캘린더) 연동
  - 실패 알림 정책(부분 실패/전체 실패) 정리
  - 메시지 포맷/지표 기준(실시간 vs 일봉) 최종 확정

---

## 1) 프로젝트 목적
개인용 Slack 브리핑 봇을 운영한다.  
한 개의 봇 안에서 여러 브리핑 모듈을 조합한다.

- 출근 브리핑
- 투자 브리핑
- 일정 브리핑

현재는 출근 브리핑(날씨/미세먼지), 투자 브리핑(환율/지수/원자재) 실데이터 연동 완료 상태다.

---

## 2) 현재 아키텍처
엔트리와 모듈을 분리한 구조로 리팩터링 완료.

```txt
index.mjs                      # 루트 래퍼 (src/index.mjs 실행)
config/env.mjs                 # 환경변수 로드/설정
src/index.mjs                  # 스케줄 + 섹션 수집 + Slack 발송 오케스트레이션
src/bot/formatMessage.mjs      # 최종 Slack 메시지 조립
src/bot/sendSlack.mjs          # Slack Webhook 발송
src/shared/http.mjs            # 공통 HTTP 유틸
src/shared/time.mjs            # 시간 포맷 유틸
src/briefings/commute/index.mjs  # 출근 브리핑 (k-skill 날씨/미세먼지)
src/briefings/invest/index.mjs   # 투자 브리핑 (환율/지수/원자재)
src/briefings/schedule/index.mjs # 일정 브리핑 (스캐폴드)
```

---

## 3) 현재 동작
`npm start` 실행 시:

1. 즉시 1회 발송
2. cron 스케줄로 반복 발송

기본 스케줄:
- `BRIEFING_CRON=0 8 * * *`
- `BRIEFING_TIMEZONE=Asia/Seoul`

운영 권장:
- GitHub Actions `schedule` 대신 EventBridge Scheduler + Lambda에서 `workflow_dispatch` 트리거

---

## 4) 데이터 소스
출근 브리핑:
- 날씨: `k-skill-proxy /v1/korea-weather/forecast`
- 미세먼지: `k-skill-proxy /v1/fine-dust/report`

투자 브리핑:
- 환율(원/달러, 원/엔): `Twelve Data price`
- 지수(S&P, 나스닥, 코스피): `Twelve Data time_series` (심볼 fallback)
- 원자재(유가/금): `Twelve Data price` (심볼 fallback)

가이드 반영 정책:
- `KSKILL_PROXY_BASE_URL`은 self-host 또는 배포 검증이 끝난 proxy URL을 명시 설정한다.
- hosted 기본 도메인 하드코딩은 사용하지 않는다.

출근 브리핑 기준값:
- 좌표: `BRIEFING_LAT`, `BRIEFING_LON`
- 지역 힌트: `BRIEFING_REGION_HINT`
- 날씨 시각: 현재 시각(KST) 기준 가장 가까운 예보 시점을 자동 선택

현재 운영 기본값은 영등포 기준으로 세팅되어 있다.

---

## 5) 메시지 포맷 정책
봇은 섹션 단위로 메시지를 구성한다.

- 봇 이름
- 생성 시각
- `[출근 브리핑]`, `[투자 브리핑]`, `[일정 브리핑]`
- 각 섹션의 기준 시각/기준값
- 섹션별 본문 라인

출근 브리핑 미세먼지 표시는 사용자 요청 반영:
- `미세: N`
- `초미세: N`

---

## 6) 환경변수 명세
필수:
- `SLACK_WEBHOOK_URL`
- `KSKILL_PROXY_BASE_URL` (self-host 또는 배포 검증 proxy)
- `TWELVE_DATA_API_KEY` (투자 브리핑)

권장:
- `BOT_NAME`
- `BRIEFING_TIMEZONE`
- `BRIEFING_CRON`
- `BRIEFING_LAT`
- `BRIEFING_LON`
- `BRIEFING_REGION_HINT`

---

## 7) 다음 우선순위 (실행 순서)
1. 일정 브리핑(캘린더) 연동
2. 섹션 ON/OFF 환경변수 도입
3. 실패 알림 정책 정리 (부분 실패 vs 전체 실패 메시지)
4. 메시지 포맷 고도화 (가독성/줄수 최적화)

---

## 8) 다른 Codex 작업 가이드
다른 Codex가 이어받을 때 반드시 확인할 것:

1. `config/env.mjs` 기준으로 환경변수 사용
2. 새 브리핑은 `src/briefings/<name>/index.mjs`에 추가
3. `src/index.mjs`의 `collectBriefings()`에 새 섹션 연결
4. Slack 발송 로직은 `src/bot/sendSlack.mjs` 단일 경로 유지
5. 민감정보(`.env`, Webhook URL) 출력/커밋 금지

---

## 9) 실행 명령
```bash
npm start
```

즉시 발송 테스트(프로세스 자동 종료):
```bash
node -e "setTimeout(() => process.exit(0), 5000); import('./index.mjs');"
```

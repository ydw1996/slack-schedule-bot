# Morning Briefing Bot Planning (Handoff Ready)

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

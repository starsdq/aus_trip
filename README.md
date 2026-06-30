# 오스트리아 & 사운드 오브 뮤직 여행 앱

정적 HTML 기반 여행 일정 앱입니다. 일정 데이터는 `data/itinerary.json`, 검증 메모와 출처는 `data/trip-audit.json`에 둡니다.

## 로컬 실행

별도 빌드 과정은 없습니다. 다만 앱이 `data/itinerary.json`과 `data/trip-audit.json`을 `fetch`로 불러오므로, 브라우저에서 `index.html`을 직접 여는 대신 로컬 서버 실행을 권장합니다.

```bash
python3 -m http.server 8000
```

그 다음 브라우저에서 `http://localhost:8000`을 엽니다.

## 데이터 검증

Node.js로 일정 데이터와 audit 파일을 검사합니다.

```bash
node tools/validate-data.mjs
```

검사 항목은 다음과 같습니다.

- `data/itinerary.json`의 날짜와 실제 2027년 요일 일치 여부
- `photo: true` 이벤트의 `assets/photos/{photoFile}` 존재 여부
- 이벤트와 식당 옵션의 `mapUrl` URL 형식
- 익일 도착 비행의 `timeEndNote` 또는 `arrivalDayOffset` 표기 여부
- `data/trip-audit.json` 존재, JSON 파싱, 출처 URL 형식

Day 10 귀국 후보편처럼 종료 시간이 시작 시간보다 이른 익일 도착 비행은 `arrivalDayOffset` 또는 `timeEndNote` 중 하나가 필요합니다. 현재 데이터는 해당 표기를 포함해 검증을 통과합니다.

## 정보 업데이트 절차

1. `data/trip-audit.json`의 `verifiedAsOf`를 업데이트 날짜로 바꿉니다.
2. LOT 공식 사이트에서 2027년 9월 ICN-WAW-MUC, PRG-WAW-ICN 운항편명과 시간을 재확인합니다.
3. DB 바이에른 티켓, ÖBB Sparschiene, 렌터카 견적을 다시 조회해 비용 효율 근거를 갱신합니다.
4. 노이슈반슈타인 성, 쇤브룬 궁전, 벨베데레, 오페라/콘서트 등 예약 필수 항목의 운영시간과 예매 가능일을 확인합니다.
5. Google Maps 링크를 실제로 열어 위치가 의도한 장소와 맞는지 확인합니다.
6. `node tools/validate-data.mjs`를 실행해 데이터 형식 오류를 확인합니다.

2026-06-30 기준으로 2027년 9월 항공 스케줄은 확정값으로 취급하지 않습니다. 앱에 표시된 항공편명과 시각은 후보 일정이며, 항공권 판매가 열릴 때 반드시 공식 예약 화면 기준으로 다시 확인해야 합니다.

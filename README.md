# 칠은영 상담소 — Phase 1

2026-11-05 연결: Firebase 프로젝트 `feelings-b08f3`의 서울 리전 데이터베이스에 문장 78개(공개 69개·비공개 9개), 감정 31개를 등록하고 보안 규칙을 적용했어요. GitHub 저장소는 `realbeginnerr/feelings`예요. 원본 `01.csv`는 비공개 문장을 포함하므로 Git 추적에서 제외하며, 공개 저장소의 CI에서는 원본 데이터 파일 검증 한 개를 건너뛰어요. 나머지 단위·화면 테스트는 그대로 실행돼요.

감정을 여러 개 선택하면 관리자가 연결한 감정 태그가 많이 일치하는 문장부터 보여주는 모바일 우선 웹사이트예요. React, TypeScript, Vite, Firebase Authentication, Cloud Firestore를 사용해요. GitHub Pages용 정적 빌드를 제공해요.

## 구현 범위

- 감정 다중 선택 및 직접 일치 개수 기반 추천, 동점 무작위 정렬, 탐색 중 순서 유지
- 세로 스크롤 문장 뷰어, 긴 원문 전체 표시, 등록된 번역·출처 표시
- 직접 일치 문장이 없을 때 관리자가 지정한 Big 3에 따른 대체 추천
- Google 로그인: 검증된 `hijmjo@gmail.com`만 관리자 권한 허용
- 관리자 문장 등록·검색·편집·삭제, 감정/공개 상태 필터, 공개·비공개 전환
- 감정 태그 생성·편집·활성화·비활성화·삭제 및 Big 3 복수 지정
- CSV 열 매핑, 미리보기, 오류/경고 구분, 행 제외, 원문 언어 수동 확인, 최종 등록
- 트랜잭션 기반 중복 등록 방지와 태그별 연결 문장 수 관리

Phase 2의 랜덤 탐색·전체 추천 목록·감정 변경 패널·고유 공유 URL·언어 전환과 Phase 3의 통계·XLSX는 포함하지 않았어요. 선택 횟수 통계가 없는 현재 감정은 한국어 이름순이에요.

## 확정한 데이터 정책

`01.csv`는 78개 문장, 31개 감정 키워드를 담고 있어요. 감정이 있는 69개는 공개, 감정 없는 9개는 비공개 초안으로 가져와요. 문장 원문과 키워드는 변경하지 않아요. 신규 태그의 Big 3와 영어 이름은 비워 두며 추론하거나 번역하지 않아요. Big 3가 비어 있으면 직접 일치 추천만 가능해요.

사용자 요청에 따라 CSV 가져오기는 공개 허용(`copyrightStatus: approved`)으로 저장해요. 개별 신규 등록은 비공개·미확인에서 시작하며, 관리자가 공개 허용 및 감정을 지정한 뒤 공개할 수 있어요. 원문 언어는 CSV 미리보기나 편집 화면에서 확인해요. 미확인으로 두어도 원문을 표시할 수 있어요.

## 로컬 실행

Node.js 24 이상을 권장해요.

```powershell
npm ci
npm run dev -- --port 5174
```

`http://127.0.0.1:5174/`에서 확인해요. Firebase 설정이 없으면 개발 서버에서만 실제 CSV의 공개 문장 69개를 읽는 미리보기를 제공해요. 관리자 저장과 로그인은 사용할 수 없어요. 비공개 9개는 미리보기 코드에 포함하지 않았으며, 배포 빌드에는 미리보기 데이터 전체가 포함되지 않아요. 실제 Firebase에 데이터가 자동으로 업로드되지는 않아요.

## Firebase 연결 — 설정 수신 후 진행할 부분

1. `.env.example`을 `.env.local`로 복사하고 기존 Firebase 웹 앱 설정의 `apiKey`, `authDomain`, `projectId`, `appId`를 대응되는 변수에 입력해요. 웹 앱 설정을 사용하며 서비스 계정 키는 필요하지 않아요.
2. Firebase Authentication에서 Google 로그인을 활성화해요. 승인된 도메인에 `127.0.0.1`, `localhost`, 배포에 사용할 GitHub Pages 호스트를 추가해요.
3. Firestore 데이터베이스를 준비해요. 앱은 `counselQuotes`, `counselTags`, `counselQuoteKeys` 컬렉션만 사용해요.
4. **같은 Firebase 프로젝트에 기존 서비스가 있으면 `firestore.rules` 전체를 그대로 덮어쓰지 마세요.** 기존 규칙 안에 상담소의 함수와 세 컬렉션의 match 블록을 병합해요. 기존의 전역 `allow read, write: if true` 같은 규칙이 상담소 경로에도 적용되지 않는지 확인해요. Firestore는 일치하는 규칙 중 하나가 허용하면 접근을 허용해요. 현재 파일은 독립 프로젝트용으로 기본 접근을 거부하며, 다른 서비스의 접근 규칙을 포함하지 않아요.
5. 규칙 병합을 확인한 뒤 기존 프로젝트 ID를 명시하여 배포해요. 예: `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`. 이 작업은 아직 실행하지 않았어요.
6. 개발 서버를 다시 시작해요. `/#admin`에서 지정된 Google 계정으로 로그인하고 CSV 가져오기에서 `01.csv`를 선택해요. 미리보기를 검토하고 확인 후 등록하면 78개가 저장돼요.

관리자 권한은 클라이언트 표시와 별개로 Firestore 서버의 규칙에서 이메일·이메일 검증·Google 로그인 제공자를 확인해요. 공개 쿼리는 공개 상태와 공개 허용 상태로 제한하며, 비공개 문장과 중복 방지 키는 관리자만 읽을 수 있어요. Firebase 연결이 실패하면 미리보기로 조용히 전환하지 않고 오류를 표시해요.

## 데이터 스키마

| 컬렉션 | 주요 필드 |
| --- | --- |
| `counselQuotes/{UUID}` | `originalText`, `originalLanguage`, `translationKo`, `translationEn`, `author`, `sourceTitle`, `sourceUrl`, `emotionTagIds: string[]`, `importedBig3Ids: string[]`, `status: draft/published`, `copyrightStatus: unreviewed/approved/restricted`, `createdAt`, `updatedAt` |
| `counselTags/{id}` | `nameKo`, `nameEn`, `big3Ids: string[]`, `isActive: boolean`, `quoteCount: number` |
| `counselQuoteKeys/{SHA256}` | 공백 정규화한 원문의 SHA-256 키, `quoteId`, `active`. 중복 제출을 트랜잭션에서 차단하는 관리자 전용 내부 자료 |

각 문서에 `id`도 저장해요. 날짜는 ISO 8601 문자열이에요. Big 3 값은 `Balance`, `Dominance`, `Stimulance`이며 나중에 입력할 수 있도록 빈 배열을 허용해요. 태그가 연결된 문장이 있으면 삭제를 차단하고 문장에서 감정을 먼저 재지정하도록 해요. 문장은 수정해도 UUID를 유지하고 삭제 후 새로 등록하면 새 UUID를 발급해요. 입력은 일반 텍스트로 렌더링하며 출처는 HTTP/HTTPS만 허용해요.

기존 CSV 두 열(`문장`, `해소 대상 감정`)과 PRD의 세 열(`문장 내용`, `림빅맵 중 어디에 해당하는지`, `구체적 키워드`)을 지원해요. CSV 인용 규칙을 Papa Parse로 처리하고, 태그는 쉼표만 구분자로 써요. 원본 Big 3는 `importedBig3Ids`로 보존하며 기존 태그 연결과 불일치하면 경고해요. 한 파일 최대 5MB, 한 등록 트랜잭션 최대 450회 쓰기를 적용해요. 오류가 있는 행은 등록에서 제외돼요.

## GitHub Pages — 저장소 수신 후 진행할 부분

저장소는 아직 연결하지 않았어요. `.github/workflows/pages.yml`은 수동 실행용 배포 워크플로예요.

1. 저장소 Settings → Pages → Source에서 GitHub Actions를 선택해요.
2. Settings → Secrets and variables → Actions → Variables에 `.env.example`의 Firebase 변수 네 개와 `VITE_BASE_PATH`를 입력해요.
3. 프로젝트 Pages라면 `VITE_BASE_PATH=/저장소이름/`, 사용자 Pages 또는 별도 도메인이라면 `/`로 지정해요.
4. Actions에서 Deploy GitHub Pages를 수동 실행해요. Firebase 설정 누락 시 배포 빌드를 차단해요.

관리자 화면은 해시(`#admin`)를 사용하므로 GitHub Pages에서 새로고침 시 별도 서버 라우팅이 필요하지 않아요. Phase 2의 공유 URL은 그 단계에서 Pages 환경에 맞춰 설계해요.

## 검증

```powershell
npm test
npm run build
```

단위·화면 테스트 17개는 추천 우선순위, 대체 추천, 비활성 태그 제외, 실제 CSV 78행 보존, 인용·줄바꿈·중복·인코딩 오류, 감정 선택 및 관리자 편집 흐름을 검증해요.

Firebase 규칙 테스트는 실제 운영 프로젝트가 아닌 로컬 에뮬레이터만 사용해요. Firestore 에뮬레이터를 `127.0.0.1:8085`, 프로젝트 `demo-feelings`로 시작한 후 실행해요.

```powershell
node tests/firestore.rules.test.mjs
```

에뮬레이터는 `firebase emulators:start --only firestore --project demo-feelings --config firebase.emulators.json`으로 실행할 수 있어요. 기존 Java 17용 에뮬레이터를 직접 실행할 경우 한국어 로케일의 오류를 피하려면 JVM 인자 `-Duser.language=en -Duser.country=US`를 사용해요. 최신 Firebase CLI/에뮬레이터는 해당 버전이 요구하는 Java를 설치해 주세요.

에뮬레이터 실행 중 `npm run test:integration`으로 저장소 통합 테스트 5개도 실행할 수 있어요. 실제 CSV 78개 저장, 공개 69개 조회, 반복·동시 중복 제출 방지, 수정 시 ID 유지, 삭제 시 연결 수 갱신, Big 3 사후 지정을 검증해요.

단위·화면 테스트 17개, 저장소 통합 테스트 5개, 권한 규칙 테스트 22개, 총 44개 검증이 통과했어요. 규칙 테스트는 비로그인·다른 계정·미검증 이메일·비Google 계정의 접근 거부, 관리자 쓰기, 공개 문장 필수 조건, 안전한 URL, 태그 삭제 제한을 확인해요. 실제 Firebase 프로젝트 로그인·규칙 배포·운영 데이터 저장은 설정이 없어 아직 검증하지 않았어요. Chrome 자동화 도구의 접근이 허용되지 않아 실제 브라우저의 시각적 검수도 남아 있어요.

## 디자인 출처

`D:\recipes\DESIGN-tsrecipe.md`, `src/index.css`, `src/components/SiteHeader.css`의 녹색·표면색·타이포그래피·레이아웃 간격·버튼·입력창 패턴을 재사용했어요. 레시피 프로젝트 파일은 수정하지 않았어요. 본문은 최소 14px, 한국어 Pretendard, 행간 1.5 이상, 자간 -0.04em을 사용해요.

# PATCH MAP 라이브러리

본 라이브러리는 [pixijs](https://github.com/pixijs/pixijs) 라이브러리를 이용하여 PATCH 서비스의 요구사항에 맞는 PATCH MAP을 제공하고자 함


## Setup

### NPM Install
```
npm install patch-map
```

<br/>
<br/>

## 개발 환경 세팅
```
npm i # 의존성 설치
npm run dev # 개발 서버 실행
npm run build # 배포 전 빌드
npm run lint:fix # 코드 정리, 커밋 전 필수
```

### VSCode 설정

https://biomejs.dev/reference/vscode/

1. Biome VS Code Extension 설치
2. `/.vscode/settings.json` 설정
```
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit"
  },
}
```
- 만약 biome formatting 되지 않는 확장자 있을 경우 (확장자마다 별도 설정 필요)
```
{
  ...
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[json]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```


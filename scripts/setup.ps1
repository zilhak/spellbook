# Spellbook 대화형 설치 스크립트 (Windows PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "🔮 Spellbook 설치 마법사" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

# 유효성 검사 함수
function Test-Path-Valid {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    # 상대 경로
    if ($Path -match '^\./') {
        return $true
    }

    # Windows 절대 경로 (C:\, D:\, E:/ 등)
    if ($Path -match '^[A-Za-z]:[/\\]') {
        return $true
    }

    # Unix 스타일 절대 경로
    if ($Path -match '^/') {
        return $true
    }

    return $false
}

function Test-Url-Valid {
    param([string]$Url)

    if ($Url -match '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$') {
        return $true
    }

    return $false
}

function Test-Port-Valid {
    param([int]$Port)

    if ($Port -ge 1 -and $Port -le 65535) {
        return $true
    }

    return $false
}

# 1. 데이터 저장 경로 설정
Write-Host "📁 데이터 저장 경로 설정" -ForegroundColor Blue
Write-Host "VectorDB 데이터를 저장할 경로를 지정하세요."
Write-Host ""
Write-Host "예시:"
Write-Host "  - 상대 경로: ./data/qdrant"
Write-Host "  - 절대 경로 (Windows): E:/spellbook-data"
Write-Host "  - 절대 경로 (WSL): /home/user/spellbook-data"
Write-Host ""

do {
    $QDRANT_DATA_PATH = Read-Host "데이터 저장 경로 [기본값: ./data/qdrant]"
    if ([string]::IsNullOrWhiteSpace($QDRANT_DATA_PATH)) {
        $QDRANT_DATA_PATH = "./data/qdrant"
    }

    if (Test-Path-Valid $QDRANT_DATA_PATH) {
        Write-Host "✓ 유효한 경로입니다: $QDRANT_DATA_PATH" -ForegroundColor Green

        $CREATE_DIR = Read-Host "이 경로에 디렉토리를 생성하시겠습니까? (y/n) [y]"
        if ([string]::IsNullOrWhiteSpace($CREATE_DIR)) {
            $CREATE_DIR = "y"
        }

        if ($CREATE_DIR -match '^[Yy]$') {
            try {
                New-Item -ItemType Directory -Path $QDRANT_DATA_PATH -Force -ErrorAction Stop | Out-Null
                Write-Host "✓ 디렉토리 생성 완료" -ForegroundColor Green
            } catch {
                Write-Host "⚠ 디렉토리 생성 실패 (권한 문제일 수 있습니다)" -ForegroundColor Yellow
                Write-Host "나중에 수동으로 생성해주세요: mkdir $QDRANT_DATA_PATH"
            }
        }
        break
    } else {
        Write-Host "✗ 유효하지 않은 경로입니다. 다시 입력해주세요." -ForegroundColor Red
    }
} while ($true)
Write-Host ""

# 2. 서버 포트 설정
Write-Host "🌐 서버 설정" -ForegroundColor Blue
do {
    $PORT_INPUT = Read-Host "MCP 서버 포트 [기본값: 8000]"
    if ([string]::IsNullOrWhiteSpace($PORT_INPUT)) {
        $PORT = 8000
    } else {
        $PORT = [int]$PORT_INPUT
    }

    if (Test-Port-Valid $PORT) {
        Write-Host "✓ 유효한 포트입니다: $PORT" -ForegroundColor Green
        break
    } else {
        Write-Host "✗ 유효하지 않은 포트입니다 (1-65535 범위)." -ForegroundColor Red
    }
} while ($true)

$HOST = Read-Host "서버 호스트 [기본값: 0.0.0.0]"
if ([string]::IsNullOrWhiteSpace($HOST)) {
    $HOST = "0.0.0.0"
}
Write-Host ""

# 3. Ollama 설정
Write-Host "🧠 Ollama 설정" -ForegroundColor Blue
do {
    $OLLAMA_HOST = Read-Host "Ollama 호스트 URL [기본값: http://localhost:11434]"
    if ([string]::IsNullOrWhiteSpace($OLLAMA_HOST)) {
        $OLLAMA_HOST = "http://localhost:11434"
    }

    if (Test-Url-Valid $OLLAMA_HOST) {
        Write-Host "✓ 유효한 URL입니다: $OLLAMA_HOST" -ForegroundColor Green

        # Ollama 연결 테스트
        try {
            $response = Invoke-WebRequest -Uri "$OLLAMA_HOST/api/tags" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            Write-Host "✓ Ollama 연결 성공" -ForegroundColor Green
        } catch {
            Write-Host "⚠ Ollama에 연결할 수 없습니다. 나중에 확인해주세요." -ForegroundColor Yellow
        }
        break
    } else {
        Write-Host "✗ 유효하지 않은 URL입니다." -ForegroundColor Red
        Write-Host "형식: http://hostname:port 또는 https://hostname:port"
    }
} while ($true)

$EMBEDDING_MODEL = Read-Host "임베딩 모델 [기본값: nomic-embed-text]"
if ([string]::IsNullOrWhiteSpace($EMBEDDING_MODEL)) {
    $EMBEDDING_MODEL = "nomic-embed-text"
}
Write-Host ""

# 4. Qdrant 설정
Write-Host "🗄️  Qdrant 설정" -ForegroundColor Blue
$QDRANT_URL = "http://qdrant:6333"
Write-Host "Qdrant URL: $QDRANT_URL (Docker 내부)"

$QDRANT_COLLECTION = Read-Host "컬렉션 이름 [기본값: chunks]"
if ([string]::IsNullOrWhiteSpace($QDRANT_COLLECTION)) {
    $QDRANT_COLLECTION = "chunks"
}

$EMBEDDING_DIMENSIONS = 768
$EMBEDDING_CONTEXT_LENGTH = 8192
Write-Host ""

# 5. 설정 요약
Write-Host "📋 설정 요약" -ForegroundColor Yellow
Write-Host "================================"
Write-Host "데이터 경로: $QDRANT_DATA_PATH"
Write-Host "서버 포트: $PORT"
Write-Host "서버 호스트: $HOST"
Write-Host "Ollama: $OLLAMA_HOST"
Write-Host "임베딩 모델: $EMBEDDING_MODEL"
Write-Host "컬렉션: $QDRANT_COLLECTION"
Write-Host "================================"
Write-Host ""

$CONFIRM = Read-Host "이 설정으로 .env 파일을 생성하시겠습니까? (y/n) [y]"
if ([string]::IsNullOrWhiteSpace($CONFIRM)) {
    $CONFIRM = "y"
}

if ($CONFIRM -match '^[Yy]$') {
    # .env 파일 생성
    $envContent = @"
# 서버 설정
PORT=$PORT
HOST=$HOST

# Qdrant 설정
QDRANT_URL=$QDRANT_URL
QDRANT_COLLECTION=$QDRANT_COLLECTION

# 데이터 저장 경로
QDRANT_DATA_PATH=$QDRANT_DATA_PATH

# Ollama 설정
OLLAMA_HOST=$OLLAMA_HOST
EMBEDDING_MODEL=$EMBEDDING_MODEL
EMBEDDING_DIMENSIONS=$EMBEDDING_DIMENSIONS
EMBEDDING_CONTEXT_LENGTH=$EMBEDDING_CONTEXT_LENGTH
"@

    $envContent | Out-File -FilePath ".env" -Encoding utf8 -Force
    Write-Host "✓ .env 파일이 생성되었습니다!" -ForegroundColor Green
    Write-Host ""

    # 6. 다음 단계 안내
    Write-Host "🚀 다음 단계" -ForegroundColor Blue
    Write-Host "================================"
    Write-Host "1. Ollama 모델 다운로드:"
    Write-Host "   ollama pull $EMBEDDING_MODEL"
    Write-Host ""
    Write-Host "2. Docker Compose 실행:"
    Write-Host "   docker-compose up -d"
    Write-Host ""
    Write-Host "3. 시스템 가이드 초기화:"
    Write-Host "   docker-compose exec spellbook pnpm run seed"
    Write-Host ""
    Write-Host "4. Claude Code MCP 설정:"
    Write-Host "   ~/.claude/mcp.json에 다음 추가:"
    Write-Host "   {
     `"mcpServers`": {
       `"spellbook`": {
         `"url`": `"http://localhost:$PORT`"
       }
     }
   }"
    Write-Host "================================"
} else {
    Write-Host "설정이 취소되었습니다." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "✨ 설치 마법사가 완료되었습니다!" -ForegroundColor Green

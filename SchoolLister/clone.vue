<template>
  <div class="container">
    <div class="search-card">
      <div class="header">
        <div class="logo"></div>
        <div class="line"></div>
        <div class="title">
          <h1>MỚI THI XONG</h1>
        </div>
      </div>
      <p>Bơi vào đây tra cứu nào!</p>

      <div class="search-form">
        <div class="column">
          <div class="form-group" id="score-group">
            <label for="score">Tổng điểm</label>
            <input
              type="number"
              step="0.25"
              placeholder="11,00"
              class="form-control"
              id="score"
              v-model="score"
            />
          </div>
          <div class="form-group" id="subject-group">
            <label for="subject-input">Khối</label>
            <div class="search-input">
              <input
                type="text"
                placeholder="A00 (Toán, Vật lý, ...)"
                class="form-control"
                id="subject-input"
                v-model="subjectGroup"
              />
              <span class="search-icon">🔍</span>
            </div>
          </div>
        </div>
        <div class="column">
          <div class="form-group" id="year-group">
            <label for="year">Năm</label>
            <select class="form-control" id="year" v-model="year">
              <option value="2010">2010</option>
              <option value="2011">2011</option>
              <option value="2012">2012</option>
            </select>
          </div>
          <div class="line" id="InfoLine"></div>

          <div class="info-text">
            <p>
              Bạn đỗ hay không là việc của bạn, chúng tôi chỉ check var xíu
              thôi.
            </p>
          </div>
        </div>

        <button class="search-button" @click="handleSearch">KIỂM TRA</button>
      </div>

      <div class="footer">
        <p>© 2025 - Ý tưởng từ Mr. Trần Đô</p>
      </div>
    </div>

    <div class="quote">
      <h2>KHÔNG HỌC,<br />CHỈ CÓ BỐC CỨT</h2>
      <p>- Câu này quen mà</p>
    </div>
  </div>
</template>

<script>
export default {
  name: "SearchForm",
  data() {
    return {
      score: "",
      subjectGroup: "",
      year: "2010",
    };
  },
  methods: {
    handleSearch() {
      // Handle search logic here
      console.log("Searching with:", {
        score: this.score,
        subjectGroup: this.subjectGroup,
        year: this.year,
      });
    },
  },
};
</script>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Lexend:wght@100..900&display=swap");

// Global variables
$color-white: #ffffff;
$color-light-gray: #e9e7e7;
$color-dark-blue: #0c1136;
$color-pink: #e72166;

// Secondary colors
$color-text: $color-dark-blue;
$color-border: #dddddd;

// Mixins
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin shadow {
  box-shadow: 8px 8px 0 $color-dark-blue;
}

// Reset
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: "Lexend", sans-serif;
  font-optical-sizing: auto;
}

// Base styles
body {
  min-height: 100vh;
  background: {
    image: url(../Assets/BackGround.jpg);
    size: cover;
  }
  @include flex-center;
}

// Container
.container {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.line {
  width: 1px;
}

// Search card
.search-card {
  background: $color-white;
  margin-left: 12vw;
  width: 26vw;
  min-height: 72vh;
  padding: 64px;
  padding-bottom: 16px;

  @media screen and (max-width: 1440px) {
    width: 32vw;
    margin-left: 6vw;
    min-height: 82vh;
  }

  @media screen and (max-width: 1200px) {
    width: 34vw;
    margin-left: 4vw;
    padding: 32px;
    padding-bottom: 8px;
  }

  @media screen and (max-width: 960px) {
    width: 62vw;
    margin-left: 19vw;
    padding: 64px;
    padding-bottom: 16px;
  }

  @include shadow;
  border: 2px solid $color-dark-blue;
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: start;

  .header {
    display: flex;
    align-items: center;
    gap: 16px;

    .logo {
      width: 32px;
      height: 32px;

      @media screen and (max-width: 1200px) {
        width: 24px;
        height: 24px;
      }

      @include flex-center;
      font-weight: bold;
      font-size: 20px;
      background-image: url(../Assets/Logo.svg);
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }

    .line {
      height: 16px;
      background-color: $color-dark-blue;
      opacity: 0.6;
    }

    .title {
      gap: 2px;
      h1 {
        font-size: 1.4rem;
        line-height: 1rem;

        @media screen and (max-width: 1200px) {
          font-size: 1.2rem;
        }
      }
    }
  }

  p {
    color: $color-text;
    font-size: 0.8rem;
    margin-bottom: 32px;
    margin-left: -2px;
  }
}

// Form styles
.column {
  display: flex;
  flex-direction: row;
  gap: 16px;
  width: 100%;
  align-items: center;
  justify-content: center;

  #score-group,
  #year-group {
    width: 38%;
  }
}

.search-form {
  flex: auto;
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  width: 100%;
}

.form-group {
  margin-bottom: 20px;

  label {
    display: block;
    margin-bottom: 8px;
    color: $color-dark-blue;
    font-size: 14px;
  }

  .form-control {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid $color-dark-blue;
    font-size: 0.9rem;
    transition: border-color 0.3s;
    background: $color-light-gray;

    &:focus {
      outline: none;
      border-color: $color-pink;
    }
  }
}

.search-input {
  position: relative;

  .search-icon {
    position: absolute;
    right: 15px;
    top: 50%;
    transform: translateY(-50%);
    color: $color-text;
  }
}

#InfoLine {
  height: 32px;
  background-color: $color-dark-blue;
  opacity: 0.6;
}

.info-text {
  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;
  flex: auto;
  max-width: 64%;
  p {
    color: $color-text;
    font-size: 14px;
    line-height: 1.4;
    margin: 0;
    width: auto;
    font-weight: 300;
  }
}

.search-button {
  margin-top: 32px;
  @media screen and (max-width: 1440px) {
    margin-top: 16px;
  }

  width: 100%;
  padding: 15px;
  background: $color-pink;
  color: $color-white;
  border: none;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0, 0, 1);
  border: 2px solid $color-dark-blue;
  box-shadow: 0px 0px 0 $color-dark-blue;

  &:hover {
    box-shadow: 4px 4px 0 $color-dark-blue;
    transform: translate(-4px, -4px);
  }
}

// Footer
.footer {
  text-align: center;
  width: 100%;
  flex: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: end;

  p {
    color: $color-text;
    font-size: 12px;
    text-align: center;
  }
}

// Quote section
.quote {
  @media screen and (max-width: 960px) {
    display: none;
  }
  color: $color-white;
  text-align: right;
  margin-left: 50px;
  flex: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  * {
    width: 30rem;
  }

  h2 {
    font-size: 48px;
    font-weight: bold;
    line-height: 1.2;
    margin-bottom: 10px;
    text-align: left;
  }

  p {
    font-size: 16px;
    opacity: 1;
    text-align: right;
  }
}

.mobile {
  .quote {
    display: none;
  }
  .container {
    align-items: center;
    justify-content: center;
  }
  .search-card {
    margin-left: 0;
    width: 90vw;
    min-height: 90vh;
    padding: 32px;

    .header {
      .title {
        h1 {
          font-size: 1.2rem;
        }
      }
    }
    .form-group {
      label {
        font-size: 0.6rem;
      }
    }

    .info-text {
      p {
        font-size: 0.8rem;
        line-height: 1rem;
      }
    }
  }
}
</style>

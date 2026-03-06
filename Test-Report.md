### 倫飛-Test Report

---

1. 歷史記憶的工單/採單號碼錯誤

![image-20260305121750361](C:\Users\user\AppData\Roaming\Typora\typora-user-images\image-20260305121750361.png)

2. 表格資料讀取的特殊情況: 像遇到如下欄位情況, 請這樣處理

   1. 同一工單SB+K261S143M02, 有兩個MO:11116160/11115829, 有兩個 Q'ty: 10/340
      '/'表示分隔, 然後按照順序對應, 所以mo:11116160的 Q'ty是10個, mo:11115829的 Q'ty是340個.
      2. 當我在搜尋11116160時, 直接顯示 Q'ty=10, 生成10個序號; 當我在搜尋111158289時, 直接顯示 Q'ty=340, 生成340個序號

   ![image-20260305121941503](C:\Users\user\AppData\Roaming\Typora\typora-user-images\image-20260305121941503.png)
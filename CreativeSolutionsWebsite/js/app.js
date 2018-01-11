$(document).ready(function(){

    // Initialize Firebase
    var config = {
        apiKey: "AIzaSyDXUq1lR4r6v2A60xUc_y8Z1sKmmBxm_6A",
        authDomain: "creativesolutions-inputdata.firebaseapp.com",
        databaseURL: "https://creativesolutions-inputdata.firebaseio.com",
        projectId: "creativesolutions-inputdata",
        storageBucket: "creativesolutions-inputdata.appspot.com",
        messagingSenderId: "1092584753428"
      };
      firebase.initializeApp(config);
    
      let database = firebase.database();
    
      // Iniitial Values
      let name = "";
      let email = "";
      let subject = "";
      let comment = "";
    
      // on click function for Submit Button
      $("#submitB").on("click", function() {
    
        event.preventDefault();
    
        let name = $("#contactName").val().trim();
        let email = $("#contactEmail").val().trim();
        let subject = $("#contactSubject").val().trim();
        let comment = $("#contactMessage").val().trim();
    
        //Creating an Object to store the data in firebase (key: value)
        userData = {
            name: name,
            email: email,
            subject: subject,
            comment: comment,
        }
    
        // push user input data into firebase
        database.ref().push(userData);
    
        //Clear all input from the user input form form
        $("#contactName").val(" ");
        $("#contactEmail").val(" ");
        $("#contactSubject").val(" ");
        $("#contactMessage").val(" ");
    
      });
    
    })
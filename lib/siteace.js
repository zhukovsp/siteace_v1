Websites = new Mongo.Collection("websites");
Comments = new Mongo.Collection("comments");

// On Client and Server
// to do: 1. higlight searching words
//        2. +add search query in url /?q=search_keywords
// 			 transform query for spacebar etc
//           delete comments
//           on startup: use search words from search query
WebsitesIndex = new EasySearch.Index({
  collection: Websites,
  fields: ['title', 'description'],
  engine: new EasySearch.Minimongo()
});

// index for recommended websites part
WebsitesIndex2 = new EasySearch.Index({
  engine: new EasySearch.MongoTextIndex({
    sort: function () {
      return { vote_up:-1,vote_down:1,title:1,createdOn:-1 };
    }
  }),
  collection: Websites,
  fields: ['title', 'description'],
  defaultSearchOptions: {
    limit: 8
  },
  permission: () => {
    //console.log(Meteor.userId());

    return true;
  }
});


if (Meteor.isClient) {

	
	/// routing 

	Router.configure({
	  layoutTemplate: 'ApplicationLayout'
	});

	Router.route('/', function () {

		this.render('navbar', {
			to:"navbar"
		});
		this.render('main', {
			to:"main",
			data: function(){
				var query = this.params.query.q
				
					var querystring = decodeURI(query);
					if (!query){
						querystring = "";
						$("#search").val("");
					}

					WebsitesIndex
					  .getComponentMethods()
					  .search(querystring);
				
			}
		});
		this.render('recommended', {
			to:"recommended"
		});
	});

	Router.route('/website/:_id', function () {
	  this.render('navbar', {
	    to:"navbar"
	  });
	  $("#search").val("");
	  this.render('website_item_on_page', {
	    to:"main", 
	    data:function(){
	      return Websites.findOne({_id:this.params._id});
	    }
	  });
  	  this.render('comments', {
	    to:"comment"
	  });
	  this.render('recommended', {
	    to:"recommended"
	  });
	});

	/////
	// template helpers 
	/////

	Template.website_list.onRendered(function(){

		// index instanceof EasySearch.index
	  let dict = WebsitesIndex.getComponentDict(/* optional name */);

		// get current search definition - using when page loading with search string in query
		var querysearch=dict.get('searchDefinition');
		//if(querysearch){
	  		console.log(querysearch);
			$("#search").val(querysearch);
		//}
	});

	// helper function that returns all available websites
	Template.website_list.helpers({
		websites:function(){
			//return Websites.find({},{sort:{title:1,createdOn:-1}});
			//return WebsitesIndex;
		},
		getDate:function(date){
			return moment(date).format('MM-DD-YYYY');
		},
		websitesIndex: () => WebsitesIndex,
		searchCount: () => {
		  // index instanceof EasySearch.index
		  let dict = WebsitesIndex.getComponentDict();
		  // get the total count of search results
		  return dict.get('count');
		},
		getText:function(count){
			if (count > 0) {
				return count + " results found"
			}
			else {
				return "No results found!"
			}
		},
	});

	// helper function that returns formated date
	Template.website_item.helpers({
		getDate:function(date){
			return moment(date).format('MM-DD-YYYY hh:mm');
		}
	});

	// helper function that returns formated date
	Template.comments.helpers({
		getDate:function(date){
			return moment(date).format('MM-DD-YYYY hh:mm');
		},
		getUser:function(user_id){
		  var user = Meteor.users.findOne({_id:user_id});
		    return user.username;
		},
		comments:function(){
			var website_id = Router.current().params._id;
			return Comments.find({"website_id":website_id},{sort:{createdOn:1}});
		}
	});

	Template.navbar.helpers({
		attributes:function(){
			var attr = { placeholder: "Search", class: "form-control js-search-go", id:"search" };
			return attr;
		},
		websitesIndex: () => WebsitesIndex
	});

	Template.recommended.helpers({
		recommends:function(){

			var website_id = this._id;
			var wsites = [];
			var words = "";

			/// get all website_id from COMMENTS 
			let cCursor = Comments.find({"userid":Meteor.user()._id});
			cCursor.fetch().forEach(function(doc){
				wsites.push(doc.website_id);
			});

			/// get all website_id from voted_up by userid
			let vCursor = Websites.find({"users_voted_up":Meteor.user()._id});
			vCursor.fetch().forEach(function(doc){
				wsites.push(doc._id);
			});

			/// returns unique website_id
			wsites = wsites.unique();

			/// get all words by unique website_id
			let wCursor = Websites.find({"_id":{$in: wsites}});
			wCursor.fetch().forEach(function(doc){
				words = words + " " + doc.title;
			});

			/// searching websites by words within title and description
			let cursor = WebsitesIndex2.search(words),
			docs = cursor.fetch();

		  	return docs;
		}
	});



	/////
	// template events 
	/////

	Template.website_item.events({
		"click .js-upvote":function(event){
			// example of how you can access the id for the website in the database
			// (this is the data context for the template)
			var website_id = this._id;

			//remove user from users_voted_down
			var isVotedUp = Websites.findOne({_id:website_id, users_voted_up:Meteor.user()._id});
			var isVotedDown = Websites.findOne({_id:website_id, users_voted_down:Meteor.user()._id});
			if(!isVotedUp && !isVotedDown)
			{
				Websites.update(
				    { _id: website_id },
				    {
				    	$pull: { users_voted_down: Meteor.user()._id } ,
					 	$addToSet: { users_voted_up: Meteor.user()._id },
					 	$inc: {vote_up:1}
				 	},
				 	{ multi: true }
				);
			}
			else
			{
				if(isVotedDown){
					Websites.update(
					    { _id: website_id },
					    {
					    	$pull: { users_voted_down: Meteor.user()._id } ,
						 	$addToSet: { users_voted_up: Meteor.user()._id },
						 	$inc: {vote_down:1,vote_up:1}
					 	},
					 	{ multi: true }
					);
					console.log("Your vote was changed");
				}
			}

            //Websites.update(
			//   { _id: website_id },
			//   { $addToSet: { users_voted_up: Meteor.user()._id }}
			//);

			return false;// prevent the button from reloading the page
		}, 
		"click .js-downvote":function(event){

			var website_id = this._id;

			//$pull - delete item
			//$addToSet - add item if doesn't exist
			var isVotedUp = Websites.findOne({_id:website_id, users_voted_up:Meteor.user()._id});
			var isVotedDown = Websites.findOne({_id:website_id, users_voted_down:Meteor.user()._id});
			if(!isVotedUp && !isVotedDown)
			{
				Websites.update(
				    { _id: website_id },
				    {
				    	$pull: { users_voted_up: Meteor.user()._id } ,
					 	$addToSet: { users_voted_down: Meteor.user()._id },
					 	$inc: {vote_down:-1}
				 	},
				 	{ multi: true }
				);
			}
			else
			{
				if(isVotedUp){
					Websites.update(
					    { _id: website_id },
					    {
					    	$pull: { users_voted_up: Meteor.user()._id } ,
						 	$addToSet: { users_voted_down: Meteor.user()._id },
						 	$inc: {vote_down:-1,vote_up:-1}
					 	},
					 	{ multi: true }
					);
					console.log("Your vote was changed");
				}
			}

			//remove user from users_voted_up
			//Websites.update(
			//   { _id: website_id },
			//  { $addToSet: { users_voted_down: Meteor.user()._id }}
			//);

			return false;// prevent the button from reloading the page
		}
	});

	Template.website_form.events({
		"click .js-toggle-website-form":function(event){
			$("#website_form").toggle('slow');
		}, 
		"submit .js-save-website-form":function(event){

			// here is an example of how to get the url out of the form:
			var url = event.target.url.value;
			var title = event.target.title.value;
			var description = event.target.description.value;
			
			if ( !url || !description){
				if(!url){ $(event.target.url).addClass("novalid");}
				if(!description) {$(event.target.description).addClass("novalid");}
				$("#validnote").addClass("novalid");
			}
			else{
				///  website saving code in here!
				if (Meteor.user()){
					Websites.insert({
						title:title, 
			    		url:url, 
			    		description:description, 
			    		createdOn:new Date()
					});
				}

				$("#website_form").toggle('slow');
			}

			return false; /// stop the form submit from reloading the page

		},
		"keypress input":function(event) {
    		$(event.target).removeClass('novalid');
    	},
    	"keyup .js-http-on":function(event){

    		/// get url from input
			var url = $(event.target).val();

			/// if url is valid
			if (isUrlValid(url)){
				var fullurl = "http://www.bing.com/search?q="+url;

				/// call server function gets html code from bing by url
				/// parsing html of page
				Meteor.call('getContentByUrl', fullurl, function(error, results) {
    				var parsed = $("<div/>").append(results.content);
	    			var title = parsed.find(".b_algo:first h2 a").text();
	    			var description = parsed.find(".b_algo:first .b_caption p:first").text();

    				/// filling out title, description fields
		    		$("#title").val(title);
		    		$("#description").val(description);
	    		});
			}
			else{console.log("it's not valid url")};
    	}
	});

	Template.comments.events({
		"submit .js-add-comment":function(event){

			/// get website_id from query
			var website_id = Router.current().params._id;
			/// get comment message
			var msg = event.target.message.value;
			/// add comment to database
			if (Meteor.user()){
				Comments.insert({
					message:msg, 
		    		website_id:website_id, 
		    		userid:Meteor.user()._id, 
		    		createdOn:new Date()
				});
			}

			/// clear message field
	  		event.target.message.value = "";

			return false;
		}
	});

	Template.navbar.events({
		"keyup .js-search-go":function(event){
			Router.go('/?q='+encodeURI(event.target.value));

			if (event.target.value.length == 0 )
			{
				Router.go('/');
				$(".searchinfo").hide();
			}
			else
			{
		        /// imitate delay and results loading gif
				$(".loading").remove();
		        $("#list_result").hide();
		        $("#result_wrapper").prepend("<div class='loading'><img src='ripple.gif'/></div>");
				setTimeout(function(){	          
		        	$(".searchinfo").show();
			  		$(".loading").remove();
					$("#list_result").show();
				}, 400);		    
				/// -
			}
		}
	});

	/// accounts config
	Accounts.ui.config({
		passwordSignupFields: "USERNAME_AND_EMAIL"
	});

	/// Regular expression tests if url is valid
	function isUrlValid(url) {
    	return /^(https?|s?ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(url);
	}

	/// returns array of unique elements
	Array.prototype.contains = function(v) {
	    for(var i = 0; i < this.length; i++) {
	        if(this[i] === v) return true;
	    }
	    return false;
	};

	Array.prototype.unique = function() {
	    var arr = [];
	    for(var i = 0; i < this.length; i++) {
	        if(!arr.contains(this[i])) {
	            arr.push(this[i]);
	        }
	    }
	    return arr; 
	}
	/// --

}


if (Meteor.isServer) {
	// start up function that creates entries in the Websites databases.
  Meteor.startup(function () {
    // code to run on server at startup
    if (!Websites.findOne()){
    	console.log("No websites yet. Creating starter data.");
    	  Websites.insert({
    		title:"Goldsmiths Computing Department", 
    		url:"http://www.gold.ac.uk/computing/", 
    		description:"This is where this course was developed.", 
    		createdOn:new Date(),
    		voted_up:0,
    		voted_down:0
    	});
    	 Websites.insert({
    		title:"University of London", 
    		url:"http://www.londoninternational.ac.uk/courses/undergraduate/goldsmiths/bsc-creative-computing-bsc-diploma-work-entry-route", 
    		description:"University of London International Programme.", 
    		createdOn:new Date(),
    		voted_up:0,
    		voted_down:0
    	});
    	 Websites.insert({
    		title:"Coursera", 
    		url:"http://www.coursera.org", 
    		description:"Universal access to the world’s best education.", 
    		createdOn:new Date(),
    		voted_up:0,
    		voted_down:0
    	});
    	Websites.insert({
    		title:"Google", 
    		url:"http://www.google.com", 
    		description:"Popular search engine.", 
    		createdOn:new Date(),
    		voted_up:0,
    		voted_down:0
    	});
    }

  });

	
	var googleurl = 'http://www.bing.com/search?q=https%3a%2f%2fwww.arduino.cc';
	
	Meteor.methods({
        getContentByUrl: function (url) {
            this.unblock();
            //console.log(url);
            return Meteor.http.call("GET", url);
        }
    });
}

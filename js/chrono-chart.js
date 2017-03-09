/*
 * Testing stacked area chart for chronological facets
 * with data from the API service
 */

function chrono_chart(chart_dom_id, json_url) {
	
	this.ctx = document.getElementById(chart_dom_id);
	this.json_url = json_url; // base url for geo-json requests
	this.json_url = this.json_url.replace('&amp;', '&');
	this.json_url = this.json_url.replace('response=geo-facet', 'response=chrono');
	this.area_color_list = [
		'#166CA5',
		'#1383C4',
		// '#FFFF66',
		'#B22A29'
	]; // list of colors for gradients
	this.line_color_list = [
		'#166CA5',
		'#1383C4',
		// '#FFFF00',
		'#B22A00'
	]; // list of colors for gradients
	
	// these are used to exclude certain chrono facets,
	// to experiment with how removing outliers etc. impact visualization
	this.exclude_facets_by_id = []; // list of chrono-facet ids we don't want
	this.exclude_earliest_after = null; // exclude earliest integer dates after this
	this.exclude_latest_before = null;  // exclude lates integer dates before this
	
	this.current_y_at_x = {};
	this.curent_year_keys = [];
	this.json_data = null;
	this.chart = null;
	this.initialize = function(){
		this.get_api_data();
	}
	this.get_api_data = function(){
		var url = this.json_url;
		var params = {};
		return $.ajax({
			type: "GET",
			url: url,
			data: params,
			dataType: "json",
			headers: {
				//added to get JSON data (content negotiation)
				Accept : "application/json; charset=utf-8"
			},
			context: this,
			success: this.get_api_dataDone, //do this when we get data w/o problems
			error: this.get_api_dataError //error message display
		});
	}
	this.get_api_dataDone = function(data){
		this.json_data = data;
		this.make_chart();
	}
	this.get_api_dataError = function(){
		
	}
	this.get_chart_datasets = function(){
		var datasets = null;
		if (this.json_data != null) {
			if ('oc-api:has-form-use-life-ranges' in this.json_data) {
				// we have time span facets
				var chrono_facets = this.json_data['oc-api:has-form-use-life-ranges'];
				datasets = this.make_chart_datasets(chrono_facets);
			}
		}
		return datasets;
	}
	this.make_chart_datasets = function(chrono_facets){
		// first sort the time spans into reverse order, so the biggest are best
		var list = {};
		var chrono_objs = {};
		var total_count = 0;
		var max_count = 0;
		var max_c_per_year = 0;
		var all_min_year = null;
		var all_max_year = null;
		
		//now remove chrono_facets based on selection criteria
		var limited_chrono_facets = [];
		for (var i = 0, length = chrono_facets.length; i < length; i++) {
			var include_ok = true; // default to including the ID
			var chrono = chrono_facets[i];
			var id = chrono.id;
			for(var j = 0, l_length = this.exclude_facets_by_id.length; j < l_length; j++) {
				var exclude_id = this.exclude_facets_by_id[j]; // the id we don't want
				if(id == exclude_id){
					// the id matches an ID we don't want to include, so exclude it
					include_ok = false;
					break;
				}
			}
			if(isNaN(this.exclude_earliest_after) == false){
				// the exclude_earliest_ater is a number
				if(parseFloat(chrono['start']) > this.exclude_earliest_after){
					// the chrono facet start is after the exclude value
					include_ok = false;
				}
			}
			if(isNaN(this.exclude_latest_before) == false){
				// the exclude_earliest_before is a number
				if(parseFloat(chrono['stop']) < this.exclude_latest_before){
					// the chrono facet stop is before the exclude value
					include_ok = false;
				}
			}
			if(include_ok){
				// the chrono facet was OK, not subject to any limits
				limited_chrono_facets.push(chrono); 
			}
		}
		
		// now make the chrono facets the chrono_facets not subject to any limits
		var chrono_facets = limited_chrono_facets;
		
		for (var i = 0, length = chrono_facets.length; i < length; i++) {
			var chrono = chrono_facets[i];
			var id = chrono.id;
			total_count += chrono.count;
			if (chrono.count > max_count) {
				max_count = chrono.count;
			}
			var t_span = parseFloat(chrono['stop']) - parseFloat(chrono['start']);
			var c_per_year = chrono.count / t_span;
			if (all_min_year == null) {
				all_min_year = parseFloat(chrono['start']);
			}
			else{
				if (all_min_year > parseFloat(chrono['start'])) {
					all_min_year = parseFloat(chrono['start']);
				}
			}
			if (all_max_year == null) {
				all_max_year = parseFloat(chrono['stop']);
			}
			else{
				if (all_max_year < parseFloat(chrono['stop'])) {
					all_max_year = parseFloat(chrono['stop']);
				}
			}
			if (c_per_year > max_c_per_year) {
				max_c_per_year = c_per_year;
			}
			list[id] = t_span;
			chrono_objs[id] = chrono;
		}
		// now sort the keys, reverse order 
		var	keys_sorted = Object.keys(list).sort(function(a,b){return list[a]-list[b]});
		keys_sorted.reverse();
		// keys_sorted.sort();
		// console.log(keys_sorted);
		
		// datasets
		var datasets = [];
		this.make_current_y_at_x(all_min_year, all_max_year);
		var all_t_span = Math.abs(all_max_year - all_min_year);
		var chart_count_year = max_count / all_t_span;
		var nearest = 25;
		if(all_t_span > 2000){
			nearest = Math.ceil(Math.log10(all_t_span)) * 100 / 2;
		}
		for (var i = 0, length = keys_sorted.length; i < length; i++) {
			var key = keys_sorted[i];
			var chrono = chrono_objs[key];
			var t_span = list[key];
			var c_per_year = chrono.count / t_span;
			var dataset = this.make_dataset();
			var style_obj = new numericStyle();
			style_obj.reset_gradient_colors(this.area_color_list);
			style_obj.min_value = 0;
			style_obj.max_value = max_count;
			style_obj.act_value = chrono.count;
			//style_obj.max_value = max_c_per_year;
			//style_obj.act_value = c_per_year;
			var hex_color = style_obj.generate_hex_color();
			
			var l_style_obj = new numericStyle();
			l_style_obj.reset_gradient_colors(this.line_color_list);
			l_style_obj.min_value = 0;
			l_style_obj.max_value = max_count;
			l_style_obj.act_value = chrono.count;
			
			//l_style_obj.max_value = max_c_per_year;
			//l_style_obj.act_value = c_per_year;
			var l_hex_color = l_style_obj.generate_hex_color();
			
			var prop_max_c_per_year = (c_per_year / max_c_per_year) * 100;
			if (prop_max_c_per_year < .05) {
				// prop_max_c_per_year = .05;
			}
			// prop_max_c_per_year = prop_max_c_per_year + (max_c_per_year * .1);
			
			var b_gradient = this.make_grandient_object(hex_color);
			var l_gradient = this.make_grandient_object(l_hex_color);
			
			// dataset.backgroundColor = hex_color;
			dataset.backgroundColor = b_gradient;
			// dataset.borderColor = l_hex_color;
			dataset.borderColor = l_gradient;
			dataset.borderStrokeColor = "#fff";
			dataset.label = this.round_date(nearest, chrono['start']);
			dataset.label += ' to ';
			dataset.label += this.round_date(nearest, chrono['stop']);
			dataset.label += ' (';
			dataset.label += chrono.count;
			dataset.label += ' items)';
			dataset.data = this.make_data_points(chart_count_year, 
							     prop_max_c_per_year,
							     chrono);
			datasets.push(dataset);
		} 
		
		return datasets;
	}
	this.round_date = function(nearest, date){
		var n_date = parseFloat(date);
		var rounded = n_date + nearest/2 - (n_date + nearest/2) % nearest;
		return rounded;
	}
	this.make_grandient_object = function(hex_color){
		// makes a gradient object for a color hex string
		var chart = this.ctx.getContext('2d');
		var gradient = chart.createLinearGradient(0, 0, 0, 400);
		var rgba_background = convertToRGB(hex_color);
		var rgba_str_0 = 'rgba(' + rgba_background.join(', ') + ', 1)';
		var rgba_str_1 = 'rgba(' + rgba_background.join(', ') + ', .5)';
		var rgba_str_2 = 'rgba(' + rgba_background.join(', ') + ', .15)';
		gradient.addColorStop(.15, rgba_str_0);   
		gradient.addColorStop(.5, rgba_str_1);
		gradient.addColorStop(1, rgba_str_2);
		return gradient;
	}
	this.make_current_y_at_x = function(all_min_year, all_max_year){
		var t_span = Math.abs(all_max_year - all_min_year);
		var increment = t_span / 2000;
		var current_y_at_x = {};
		all_min_year = all_min_year - (increment * 3);
		all_max_year = all_max_year + (increment * 3);
		for (var year = all_min_year; year <= all_max_year; year += increment) {
			current_y_at_x[year] = 0;
			this.curent_year_keys.push(year);
		}
		this.current_y_at_x = current_y_at_x; 
		return this.current_y_at_x;
	}
	this.get_current_y_for_year = function(year){
		//get the current y value for the year
		if (year in this.current_y_at_x) {
			return this.current_y_at_x[year];
		}
		else{
			return 0;
		}
	}
	this.make_data_points = function(chart_count_year, c_per_year, chrono){
		
		var data_list = [];
		var start = parseFloat(chrono['start']);
		var end = parseFloat(chrono['stop']);
		var median_year = (start + end) / 2;
		var t_span = Math.abs(end - start);
		var added = .002;
		for (var i = 0, length = this.curent_year_keys.length; i < length; i++) {
			var year = this.curent_year_keys[i];
			if (year >= start && year <= end) {
				// we're in the time span of the current dataset
				var c_per_year = chrono.count / t_span;
				if(c_per_year < chart_count_year * .25){
					// makes sure the bumps are minimally visible
					c_per_year = chart_count_year * .25;
				}
				
				var act_median_year = median_year;
				var sigma = t_span * .15;
				var y = this.gaussian(year, act_median_year, sigma);
				y = y * (c_per_year);
				
				var data_point = {
					x: year,
					y: y};
			}
			else{
				var data_point = {
					x: year,
					y: 0};
			}
			data_list.push(data_point);
		}
		// console.log(this.current_y_at_x);
		// console.log(data_list);
		return data_list;
	}
	this.gaussian = function(x, mean, sigma) {
		// computes y for a normal distribution curve
		var gaussianConstant = 1 / Math.sqrt(2 * Math.PI);
		x = (x - mean) / sigma;
		return gaussianConstant * Math.exp(-.5 * x * x) / sigma;
	};
	this.make_dataset = function(){
		var dataset = {
			label: '',
			url: '',
			data: [],
			backgroundColor: "rgba(75,192,192,0.4)",
            borderColor: "rgba(75,192,192,1)",
			borderWidth: 1,
			pointRadius: 0,
			showLines: true,
			spanGaps: true,
			lineTension: 0,
			lineJoin: 'round',
		}
		return dataset;
	}
	this.make_chart = function(){
		var datasets = this.get_chart_datasets();
		// console.log(datasets);
		var act_chart = new Chart(this.ctx,
		{
			type: 'line',
			responsive: true,
			data: {
				datasets: datasets,
			},
			options: {
				legend: {
					display: false,
				},
				tooltips: {
					callbacks: {
						label: function(tooltipItems, data){
							// console.log(data.datasets[tooltipItems.datasetIndex].label);
							return data.datasets[tooltipItems.datasetIndex].label;
						},
						title: function(){
							return 'Estimated Time Span';
						}
					},
				},
				scales: {
					yAxes: [{
						stacked: true,
						display: false
					}],
					xAxes: [{
						type: 'linear',
						position: 'top',
						ticks: {
							max: 2000,
						}
					}]
				}
			},
		});
		this.chart = act_chart;	
	}
	// functions for managing filters to exclude facets
	this.exclude = function(){
		// adds user input of chronology facets to exclude
		var dom_id = 'exclude_id';
		if(document.getElementById(dom_id)){
			var dom = document.getElementById(dom_id);
			var ex_id = dom.value;
			if(this.exclude_facets_by_id.indexOf(ex_id) < 0){
				// this exclude ID is not yet in the exclude list, so add it
				this.exclude_facets_by_id.push(ex_id);
				
				// show the new excluded ID list in HTML
				this.excluded_facet_ids_html();
				
				// now make the chart again, using this revised exclude list
				this.make_chart();
			}
		}
		return false; // so as not to reload the page
	}
	this.exclude_dates = function(){
		// adds user input of dates to exclude
		var after_dom_id = 'exclude_after';
		var before_dom_id = 'exclude_before';
		if(document.getElementById(after_dom_id) && document.getElementById(before_dom_id)){
			var input_ok = false;
			var after_dom = document.getElementById(after_dom_id);
			var before_dom = document.getElementById(before_dom_id);
			if(isNaN(after_dom.value)){
				// not a number, so can't use.
				after_dom.value = '';
			}
			else{
				this.exclude_earliest_after = after_dom.value;
				input_ok = true;
			}
			if(isNaN(before_dom.value)){
				// not a number, so can't use.
				before_dom.value = '';
			}
			else{
				this.exclude_latest_before = before_dom.value;
				input_ok = true;
			}
			if(input_ok){
				// update the chart with the exclusion date(s)
				this.make_chart();
			}
		}
		return false; // so as not to reload the page
	}
	this.clear_exclusions = function(){
		// this function removes all current filters.
		this.exclude_facets_by_id = []; // list of chrono-facet ids we don't want
		this.exclude_earliest_after = null; // exclude earliest integer dates after this
		this.exclude_latest_before = null;  // exclude lates integer dates before this
		
		// update the list of excluded IDs
		this.excluded_facet_ids_html();
		
		// clear exclusion dates
		var after_dom_id = 'exclude_after';
		var before_dom_id = 'exclude_before';
		if(document.getElementById(after_dom_id) && document.getElementById(before_dom_id)){
			var after_dom = document.getElementById(after_dom_id);
			var before_dom = document.getElementById(before_dom_id);
			after_dom.value = '';
			before_dom.value = '';
		}
		return false; // so as not to reload the page
	}
	this.excluded_facet_ids_html = function(){
		// shows a list of what the excluded facets are in the page HTML
		var dom_id = 'excluded_ids';
		if(document.getElementById(dom_id)){
			var dom = document.getElementById(dom_id);
			var html = '';
			for (var i = 0, length = this.exclude_facets_by_id.length; i < length; i++) {
				var id = this.exclude_facets_by_id[i];
				html += '<li><a href="' + id + '" target="_blank">' + id + '</a></li>';
			}
			dom.innerHTML = html;
		}
	}
	this.reload = function(){
		var dom_id = 'oc_url';
		if(document.getElementById(dom_id)){
			var dom = document.getElementById(dom_id);
			var oc_url = dom.value;
			var reload_url = 'makeChart.html?oc-search=' + encodeURIComponent(oc_url);
			window.location = reload_url;
		}
	}
}
